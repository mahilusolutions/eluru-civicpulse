/**
 * Import phone numbers onto voters by Voter ID (EPIC).
 * Stores one or more numbers per voter in voterdb.electors.phone (PostgreSQL text[]).
 *
 *   node scripts/importPhones.js path/to/file.xlsx              # dry run
 *   node scripts/importPhones.js path/to/file.xlsx --apply      # write
 *   node scripts/importPhones.js path/to/file.xlsx --apply --overwrite
 *
 * --overwrite  replace existing phones with the file's list
 * (default)    merge: keep existing numbers and add any new ones from the file
 *
 * Accepts .xlsx / .xls / .csv. Needs a Voter ID column and a Mobile/Phone column.
 * Several rows with the same EPIC and different numbers → all numbers are kept.
 */
const fs = require('fs');
const path = require('path');
const { prisma } = require('../db');
const { logAudit } = require('../lib/audit');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const OVERWRITE = args.includes('--overwrite');
if (!file) {
  console.error('Usage: node scripts/importPhones.js <file.xlsx|csv> [--apply] [--overwrite]');
  process.exit(1);
}

const normEpic = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');

/** Indian mobile: strips +91 / 91 / leading 0, keeps 10 digits starting 6-9. */
function normPhone(v) {
  if (v == null || v === '') return null;
  let d = String(v).trim();
  if (/e\+/i.test(d)) d = Number(v).toFixed(0);
  d = d.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) return d;
  return null;
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((c) => String(c).trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => String(c).trim() !== '')) rows.push(row);
  return rows;
}

function loadRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    let XLSX;
    try {
      XLSX = require('xlsx');
    } catch {
      throw new Error('Install xlsx first: npm install xlsx (in civicpulse-backend)');
    }
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
    if (!json.length) throw new Error('The spreadsheet has no data rows.');
    const headers = Object.keys(json[0]);
    return {
      headers,
      rows: json.map((r) => headers.map((h) => r[h])),
    };
  }
  const table = parseCsv(fs.readFileSync(filePath, 'utf8'));
  if (table.length < 2) throw new Error('The file has no data rows.');
  return { headers: table[0], rows: table.slice(1) };
}

function pickCol(headers, names) {
  const norm = headers.map((h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
  return norm.findIndex((h) => names.includes(h));
}

function samePhones(a, b) {
  const left = [...(a || [])].sort().join(',');
  const right = [...(b || [])].sort().join(',');
  return left === right;
}

function mergePhones(existing, incoming) {
  const out = [];
  for (const p of [...(existing || []), ...incoming]) {
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

(async () => {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);

  const colType = await prisma.$queryRaw`
    SELECT udt_name FROM information_schema.columns
    WHERE table_schema = 'voterdb' AND table_name = 'electors' AND column_name = 'phone'`;
  const phoneIsArray = colType[0]?.udt_name === '_text';
  console.log(`DB phone column type: ${phoneIsArray ? 'text[] (array)' : colType[0]?.udt_name || 'missing'}`);

  const { headers, rows } = loadRows(abs);
  const iEpic = pickCol(headers, ['voterid', 'epic', 'epicno', 'epicnumber', 'voteridno', 'voteridnumber', 'id']);
  const iPhone = pickCol(headers, [
    'phone',
    'phonenumber',
    'mobile',
    'mobilenumber',
    'mobileno',
    'phoneno',
    'contact',
    'contactnumber',
    'cell',
  ]);
  if (iEpic < 0 || iPhone < 0) {
    throw new Error(`Could not find columns. Headers: ${headers.join(' | ')}. Need Voter ID + Mobile/Phone.`);
  }

  const byEpic = new Map(); // epic -> Set of phones
  const report = [['row', 'voter_id', 'phone', 'problem']];
  let invalid = 0;
  let blankPhone = 0;

  rows.forEach((r, idx) => {
    const line = idx + 2;
    const epic = normEpic(r[iEpic]);
    const rawPhone = r[iPhone];
    if (!epic) {
      report.push([line, r[iEpic], rawPhone, 'missing voter id']);
      return;
    }
    if (rawPhone == null || String(rawPhone).trim() === '') {
      blankPhone += 1;
      return;
    }
    const phone = normPhone(rawPhone);
    if (!phone) {
      invalid += 1;
      report.push([line, epic, rawPhone, 'not a valid 10-digit mobile number']);
      return;
    }
    if (!byEpic.has(epic)) byEpic.set(epic, new Set());
    byEpic.get(epic).add(phone);
  });

  const epics = [...byEpic.keys()];
  const found = new Map(); // epic -> { n, current: string[] }
  for (let i = 0; i < epics.length; i += 5000) {
    const chunk = epics.slice(i, i + 5000);
    // Works before and after text → text[] migrate
    const res = phoneIsArray
      ? await prisma.$queryRaw`
          SELECT epic, COUNT(*)::int AS n,
                 COALESCE(
                   (array_agg(phone) FILTER (WHERE cardinality(phone) > 0))[1],
                   '{}'::text[]
                 ) AS current
          FROM voterdb.electors WHERE epic = ANY(${chunk}::text[])
          GROUP BY epic`
      : await prisma.$queryRaw`
          SELECT epic, COUNT(*)::int AS n, MAX(phone) AS current
          FROM voterdb.electors WHERE epic = ANY(${chunk}::text[])
          GROUP BY epic`;
    res.forEach((x) => {
      let current = [];
      if (Array.isArray(x.current)) current = x.current.filter(Boolean);
      else if (x.current) current = [String(x.current)];
      found.set(x.epic, { n: x.n, current });
    });
  }

  const todo = []; // { epic, phones, n, previous }
  let notFound = 0;
  let same = 0;
  let multi = 0;

  for (const [epic, set] of byEpic) {
    const phones = [...set];
    if (phones.length > 1) multi += 1;
    const f = found.get(epic);
    if (!f) {
      notFound += 1;
      report.push(['', epic, phones.join('; '), 'voter id not found in the voter list']);
      continue;
    }
    const next = OVERWRITE ? phones : mergePhones(f.current, phones);
    if (samePhones(f.current, next)) {
      same += 1;
      continue;
    }
    todo.push({ epic, phones: next, n: f.n, previous: f.current });
  }

  const voterRows = todo.reduce((a, t) => a + t.n, 0);
  const phoneSlots = [...byEpic.values()].reduce((a, s) => a + s.size, 0);

  console.log(`File: ${path.basename(abs)}`);
  console.log(`File data rows: ${rows.length}`);
  console.log(`Unique voter ids with ≥1 phone in file: ${byEpic.size}`);
  console.log(`Phone numbers in file (after normalize): ${phoneSlots}`);
  console.log(`Voter ids with 2+ different phones: ${multi}`);
  console.log(`Will update: ${todo.length} voter ids (${voterRows} elector rows)`);
  console.log(
    `Skipped — blank phone: ${blankPhone}, invalid: ${invalid}, not in DB: ${notFound}, already same: ${same}`
  );
  console.log(`Mode: ${OVERWRITE ? 'overwrite' : 'merge'} · ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  if (report.length > 1) {
    const out = abs.replace(/\.[^.]+$/, '') + '.report.csv';
    fs.writeFileSync(
      out,
      '\uFEFF' + report.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    );
    console.log(`Problem report: ${out}`);
  }

  if (!APPLY) {
    console.log('DRY RUN — nothing saved. Add --apply to save (also migrates phone → text[] if needed).');
    return;
  }

  if (!phoneIsArray) {
    console.log('Migrating voterdb.electors.phone text → text[] …');
    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS voterdb.idx_electors_phone_trgm');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE voterdb.electors
        ALTER COLUMN phone TYPE text[]
        USING CASE
          WHEN phone IS NULL OR btrim(phone) = '' THEN '{}'::text[]
          ELSE ARRAY[btrim(phone)]
        END`);
    await prisma.$executeRawUnsafe(`ALTER TABLE voterdb.electors ALTER COLUMN phone SET DEFAULT '{}'::text[]`);
    await prisma.$executeRawUnsafe(`ALTER TABLE voterdb.electors ALTER COLUMN phone SET NOT NULL`);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_electors_phone_gin ON voterdb.electors USING gin (phone)');
    console.log('Column migrated.');
  }

  for (let i = 0; i < todo.length; i += 1500) {
    const chunk = todo.slice(i, i + 1500);
    const payload = JSON.stringify(chunk.map((t) => ({ epic: t.epic, phones: t.phones })));
    await prisma.$executeRaw`
      UPDATE voterdb.electors e
      SET phone = (
            SELECT COALESCE(array_agg(p ORDER BY ord), '{}'::text[])
            FROM jsonb_array_elements_text(x.phones) WITH ORDINALITY AS t(p, ord)
          ),
          updated_at = now()
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(epic text, phones jsonb)
      WHERE e.epic = x.epic`;
    process.stdout.write(`  saved ${Math.min(i + chunk.length, todo.length)} / ${todo.length}\r`);
  }
  console.log('');

  await logAudit(prisma, {
    entity: 'voter',
    entityId: null,
    action: 'update',
    actorRole: 'system',
    summary: `Phone import from ${path.basename(abs)}: ${todo.length} voter ids (${voterRows} rows), array mode`,
    after: {
      file: path.basename(abs),
      voter_ids: todo.length,
      rows: voterRows,
      overwrite: OVERWRITE,
      multi_phone_ids: multi,
    },
  });
  console.log(`SAVED: ${todo.length} voter ids (${voterRows} elector rows).`);
})()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
