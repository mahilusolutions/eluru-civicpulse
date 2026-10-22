/**
 * Add phone numbers to voters by matching the Voter ID (EPIC), e.g. WIO2501872.
 *
 *   node scripts/importPhones.js phones.csv              # dry run: shows what would change, writes nothing
 *   node scripts/importPhones.js phones.csv --apply      # save the phone numbers
 *   node scripts/importPhones.js phones.csv --apply --overwrite   # also replace numbers already saved
 *
 * The file needs one column with the Voter ID and one with the phone number (any header names like
 * "Voter ID", "EPIC", "Phone", "Mobile"). Comma, semicolon or tab separated. From Excel use Save As -> CSV.
 * Every voter row that has the same Voter ID gets the number (the same person can appear in more than one roll).
 * A voter ID that appears with two different numbers is NOT guessed: it is skipped and both numbers are listed in the report.
 * A report of numbers that could not be used is written next to the file as <name>.report.csv.
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
  console.error('Usage: node scripts/importPhones.js <file.csv> [--apply] [--overwrite]');
  process.exit(1);
}

/** Small CSV reader: quotes, BOM, and comma / semicolon / tab separators. */
function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
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
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const normEpic = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');

/** Indian mobile: strips +91 / 91 / leading 0, keeps 10 digits starting 6-9. Other lengths are kept only if 7-15 digits. */
function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) return d;
  return null;
}

(async () => {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (rows.length < 2) throw new Error('The file has no data rows.');
  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = (names) => header.findIndex((h) => names.includes(h));
  const iEpic = col(['voterid', 'epic', 'epicno', 'epicnumber', 'voteridno', 'voteridnumber', 'id']);
  const iPhone = col(['phone', 'phonenumber', 'mobile', 'mobilenumber', 'mobileno', 'phoneno', 'contact', 'contactnumber', 'cell']);
  if (iEpic < 0 || iPhone < 0) {
    throw new Error(`Could not find the columns. Headers seen: ${rows[0].join(' | ')}. Need a Voter ID column and a Phone column.`);
  }

  const report = [['row', 'voter_id', 'phone', 'problem']];
  const byEpic = new Map();
  const numbersFor = new Map(); // epic -> every different number the file gives for it
  let invalid = 0;
  let conflicting = 0;
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const epic = normEpic(r[iEpic]);
    const rawPhone = r[iPhone];
    if (!epic) return report.push([line, r[iEpic], rawPhone, 'missing voter id']);
    const phone = normPhone(rawPhone);
    if (!phone) {
      invalid += 1;
      return report.push([line, epic, rawPhone, 'not a valid 10-digit mobile number']);
    }
    if (!numbersFor.has(epic)) numbersFor.set(epic, new Set());
    numbersFor.get(epic).add(phone);
    return byEpic.set(epic, phone);
  });
  // A voter ID with more than one number is ambiguous: leave it out and list the numbers for a person to decide.
  for (const [epic, set] of numbersFor) {
    if (set.size > 1) {
      conflicting += 1;
      byEpic.delete(epic);
      report.push(['', epic, [...set].join(' / '), 'several different numbers for this voter id - not saved, choose one']);
    }
  }

  // Which of these voter ids exist, and which already have a number?
  const epics = [...byEpic.keys()];
  const found = new Map(); // epic -> { rows, withPhone, current }
  for (let i = 0; i < epics.length; i += 5000) {
    const chunk = epics.slice(i, i + 5000);
    const res = await prisma.$queryRaw`
      SELECT epic, COUNT(*)::int AS n, MAX(phone) AS current
      FROM voterdb.electors WHERE epic = ANY(${chunk}::text[]) GROUP BY epic`;
    res.forEach((x) => found.set(x.epic, x));
  }
  const todo = [];
  let notFound = 0;
  let alreadyHas = 0;
  let same = 0;
  for (const [epic, phone] of byEpic) {
    const f = found.get(epic);
    if (!f) {
      notFound += 1;
      report.push(['', epic, phone, 'voter id not found in the voter list']);
    } else if (f.current && f.current === phone) same += 1;
    else if (f.current && !OVERWRITE) {
      alreadyHas += 1;
      report.push(['', epic, phone, `voter already has ${f.current} (use --overwrite to replace)`]);
    } else todo.push([epic, phone, f.n, f.current || null]);
  }

  const voterRows = todo.reduce((a, t) => a + t[2], 0);
  console.log(`File rows: ${rows.length - 1}`);
  console.log(`Usable voter id + phone pairs: ${byEpic.size}`);
  console.log(`Will set: ${todo.length} voter ids (${voterRows} voter rows)`);
  console.log(`Skipped - invalid phone: ${invalid}, conflicting duplicates: ${conflicting}, not in voter list: ${notFound}, already have a number: ${alreadyHas}, already the same: ${same}`);

  if (report.length > 1) {
    const out = file.replace(/\.[^.]+$/, '') + '.report.csv';
    fs.writeFileSync(out, '﻿' + report.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n'));
    console.log(`Problem report: ${out}`);
  }

  if (!APPLY) {
    console.log('DRY RUN - nothing saved. Add --apply to save.');
    return;
  }

  for (let i = 0; i < todo.length; i += 2000) {
    const chunk = todo.slice(i, i + 2000);
    await prisma.$executeRaw`
      UPDATE voterdb.electors e SET phone = v.phone, updated_at = now()
      FROM unnest(${chunk.map((t) => t[0])}::text[], ${chunk.map((t) => t[1])}::text[]) AS v(epic, phone)
      WHERE e.epic = v.epic`;
  }
  await logAudit(prisma, {
    entity: 'voter',
    entityId: null,
    action: 'update',
    actorRole: 'system',
    summary: `Phone import from ${path.basename(file)}: ${todo.length} voter ids (${voterRows} rows) updated`,
    after: { file: path.basename(file), voter_ids: todo.length, rows: voterRows, overwrite: OVERWRITE },
  });
  console.log(`SAVED: ${todo.length} voter ids (${voterRows} voter rows).`);
})()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
