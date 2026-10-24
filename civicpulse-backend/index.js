const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Prisma } = require('@prisma/client');
const { prisma, initDb, DATABASE_URL } = require('./db');
const { serialize } = require('./lib/serialize');
const { parseFilename } = require('./services/parseFilename');
const { findPdftoppm } = require('./lib/poppler');
const { splitHouse } = require('./lib/house');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { responseCache } = require('./lib/cache');
const { logAudit } = require('./lib/audit');
const { createAuth, actorOf, allowedOrigins } = require('./lib/authMiddleware');

/** House number and address note as separate fields (the roll mixes them in one). */
function houseFields(raw) {
  const { number, note } = splitHouse(raw);
  return { house_number: number, address_note: note };
}

// Needed for the one-time login hand-over. Production refuses to start without it; local development makes a temporary one.
if (!/^[0-9a-f]{64}$/i.test(process.env.AUTH_SECRET || '')) {
  if (process.env.NODE_ENV === 'production') {
    console.error('AUTH_SECRET is missing or not 64 hex characters. Run: node scripts/generateSecret.js and add AUTH_SECRET=... to .env');
    process.exit(1);
  }
  process.env.AUTH_SECRET = require('crypto').randomBytes(32).toString('hex');
  console.warn('AUTH_SECRET not set: using a temporary one (pending logins will not survive a restart). Fine for development.');
}

const app = express();
const PORT = process.env.PORT || 4000;
const OCR_UPLOAD_DIR =
  process.env.OCR_UPLOAD_DIR ||
  path.resolve(__dirname, '../eluru_voters_data_ocr_extraction/uploaded_files');
const OCR_PAGE_IMAGES_DIR =
  process.env.OCR_PAGE_IMAGES_DIR || path.join(OCR_UPLOAD_DIR, 'page_images');
const OCR_EXTRACT_URL = process.env.OCR_EXTRACT_URL || 'http://127.0.0.1:2000';

/** Roll PDFs may sit in the OCR upload folder or in voter_data_eluru; use whichever has the file. */
const ROLL_DIRS = [OCR_UPLOAD_DIR, path.resolve(__dirname, '../voter_data_eluru'), ...(process.env.ROLL_PDF_DIRS || '').split(',').map((d) => d.trim()).filter(Boolean)];
function findRollPdf(doc) {
  return [doc.storagePath, ...ROLL_DIRS.map((d) => path.join(d, doc.filename))].find((p) => p && fs.existsSync(p)) || null;
}

function pageImagePath(filename, pageNo) {
  if (!filename || pageNo == null) return null;
  const stem = path.parse(filename).name;
  const file = path.join(OCR_PAGE_IMAGES_DIR, stem, `page-${pageNo}.png`);
  return fs.existsSync(file) ? file : null;
}

/** Fill section/page fields if Prisma client predates those columns. */
async function hydrateElectorExtras(rows) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length) return rows;
  const ids = list.map((r) => r.id).filter((id) => id != null);
  if (!ids.length) return rows;
  try {
    const extras = await prisma.$queryRaw`
      SELECT id, section_no, section_name, page_no
      FROM voterdb.electors
      WHERE id IN (${Prisma.join(ids.map((id) => BigInt(id)))})
    `;
    const map = new Map(extras.map((e) => [String(e.id), e]));
    for (const row of list) {
      const ex = map.get(String(row.id));
      if (!ex) continue;
      if (row.sectionNo == null && row.section_no == null) {
        row.sectionNo = ex.section_no != null ? Number(ex.section_no) : null;
      }
      if (row.sectionName == null && row.section_name == null) {
        row.sectionName = ex.section_name || null;
      }
      if (row.pageNo == null && row.page_no == null) {
        row.pageNo = ex.page_no != null ? Number(ex.page_no) : null;
      }
    }
  } catch (err) {
    console.warn('hydrateElectorExtras:', err.message);
  }
  return rows;
}

app.set('trust proxy', 1); // behind Nginx
app.disable('x-powered-by');
app.use(compression());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
// CORS_ORIGINS="https://eluru.mahilusolutions.com,https://other" locks the API to those sites (default: any, for local dev).
app.use(cors({ origin: allowedOrigins(), credentials: true })); // with no listed origins the API answers only its own site
// ~1000 people on one office/mobile network can share an IP, so the ceiling is generous; it only stops runaway clients.
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_PER_MIN || 600),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please wait a moment and try again.' },
  })
);
app.use(express.json({ limit: '2mb' }));

// ---- Sign-in: every /api call (except sign-in and the public request pages) needs a live session and the right role.
const auth = createAuth({ prisma, fail });
app.use('/api', auth.loadSession);
app.use('/api', auth.gate);
app.use(responseCache);
app.get('/api/health', asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ success: true, status: 'ok', uptime_s: Math.round(process.uptime()) });
}));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(OCR_UPLOAD_DIR)) fs.mkdirSync(OCR_UPLOAD_DIR, { recursive: true });
    cb(null, OCR_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[\\/<>:"|?*\x00-\x1f]/g, '_');
    cb(null, safe || `${Date.now()}.pdf`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function ok(res, data) {
  res.json({ success: true, data: serialize(data) });
}
function fail(res, status, message) {
  res.status(status).json({ success: false, message });
}
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    ok(res, {
      status: 'ok',
      product: 'CivicPulse',
      city: 'Eluru',
      db: 'postgresql+prisma',
      schemas: ['public', 'voterdb'],
    });
  })
);

async function fetchOcrLive() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const [jobsRes, healthRes] = await Promise.all([
      fetch(`${OCR_EXTRACT_URL}/api/jobs`, { signal: ctrl.signal }),
      fetch(`${OCR_EXTRACT_URL}/api/health`, { signal: ctrl.signal }),
    ]);
    clearTimeout(t);
    const jobsJson = jobsRes.ok ? await jobsRes.json() : null;
    const healthJson = healthRes.ok ? await healthRes.json() : null;
    const byName = {};
    for (const j of jobsJson?.jobs || []) {
      if (j?.filename) byName[j.filename] = j;
    }
    return {
      online: !!healthJson?.ok,
      stats: jobsJson?.stats || healthJson?.queue || null,
      byName,
    };
  } catch {
    return { online: false, stats: null, byName: {} };
  }
}

// ---------- Data pipeline (voterdb) ----------
app.get(
  '/api/data/files',
  asyncHandler(async (_req, res) => {
    const [rows, ocr] = await Promise.all([
      prisma.rollFile.findMany({
        orderBy: [{ partNo: 'asc' }, { id: 'desc' }],
        include: {
          document: {
            select: {
              id: true,
              textLength: true,
              pageCount: true,
              extractedAt: true,
              durationMs: true,
              source: true,
            },
          },
        },
      }),
      fetchOcrLive(),
    ]);
    ok(
      res,
      rows.map((r) => {
        const live = ocr.byName[r.filename] || null;
        let parseStatus = r.parseStatus;
        // Prefer live OCR job status while still running
        if (live?.status === 'active') parseStatus = 'ocr';
        else if (live?.status === 'pending' && parseStatus === 'queued') parseStatus = 'queued';
        else if (live?.status === 'failed') parseStatus = 'failed';

        const pageDone = live?.page ?? null;
        const pageTotal = live?.total_pages || r.pageCount || r.document?.pageCount || 0;

        return {
          ...r,
          parse_status: parseStatus,
          voter_count: r.voterCount,
          part_no: r.partNo,
          page_count: pageTotal || r.pageCount,
          page_done: pageDone,
          error_message: live?.error || r.errorMessage,
          text_length: r.document?.textLength ?? null,
          document_id: r.documentId,
          extracted_at: r.document?.extractedAt ?? r.processedAt,
          duration_ms: live?.duration_ms ?? r.document?.durationMs ?? null,
          ocr_stage: live?.stage || null,
          ocr_eta_seconds: live?.eta_seconds ?? null,
          ocr_online: ocr.online,
          ocr_job_status: live?.status || null,
        };
      })
    );
  })
);

app.get(
  '/api/data/ocr-status',
  asyncHandler(async (_req, res) => {
    const ocr = await fetchOcrLive();
    ok(res, {
      online: ocr.online,
      extract_url: OCR_EXTRACT_URL,
      stats: ocr.stats,
    });
  })
);

app.get(
  '/api/data/documents',
  asyncHandler(async (_req, res) => {
    const docs = await prisma.extractedDocument.findMany({
      orderBy: { partNo: 'asc' },
      select: {
        id: true,
        filename: true,
        partNo: true,
        pageCount: true,
        textLength: true,
        voterCount: true,
        source: true,
        mode: true,
        extractedAt: true,
        jobId: true,
        durationMs: true,
      },
    });
    ok(res, docs);
  })
);

app.get(
  '/api/data/files/:id',
  asyncHandler(async (req, res) => {
    const id = BigInt(req.params.id);
    const file = await prisma.rollFile.findUnique({
      where: { id },
      include: { document: true },
    });
    if (!file) return fail(res, 404, 'File not found');
    ok(res, file);
  })
);

app.post(
  '/api/data/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return fail(res, 400, 'PDF file required');
    const meta = parseFilename(req.file.originalname);
    const filename = req.file.filename;

    if (meta.partNo != null || meta.part_no != null) {
      const partNo = meta.part_no ?? meta.partNo;
      await prisma.booth.upsert({
        where: { partNo },
        create: {
          partNo,
          areaName: `Part ${partNo}`,
          pollingStationName: `Polling Station Part ${partNo}`,
          status: 'pending',
        },
        update: {},
      });
    }

    const row = await prisma.rollFile.upsert({
      where: { filename },
      create: {
        filename,
        partNo: meta.part_no ?? null,
        acCode: meta.ac_code || 'S01-65',
        year: meta.year || 2026,
        storagePath: req.file.path,
        parseStatus: 'queued',
      },
      update: {
        partNo: meta.part_no ?? null,
        storagePath: req.file.path,
        parseStatus: 'queued',
        errorMessage: null,
        processedAt: null,
      },
    });

    // Ask OCR extract service to pick up waiting PDFs (best-effort)
    try {
      await fetch(`${OCR_EXTRACT_URL}/api/recover`, { method: 'POST' });
    } catch {
      /* OCR service may be remote / down */
    }

    ok(res, {
      ...row,
      part_no: row.partNo,
      parse_status: row.parseStatus,
      message: 'Queued — OCR service will process and save into voterdb',
    });
  })
);

app.post(
  '/api/data/files/:id/retry',
  asyncHandler(async (req, res) => {
    const id = BigInt(req.params.id);
    const file = await prisma.rollFile.findUnique({ where: { id } });
    if (!file) return fail(res, 404, 'File not found');
    const updated = await prisma.rollFile.update({
      where: { id },
      data: { parseStatus: 'queued', errorMessage: null },
    });
    try {
      await fetch(`${OCR_EXTRACT_URL}/api/recover`, { method: 'POST' });
    } catch {
      /* ignore */
    }
    ok(res, { ...updated, parse_status: updated.parseStatus, part_no: updated.partNo });
  })
);

app.post(
  '/api/data/import',
  asyncHandler(async (req, res) => {
    const { part_no, voters } = req.body || {};
    if (!part_no || !Array.isArray(voters) || !voters.length) {
      return fail(res, 400, 'part_no and voters[] required');
    }
    const partNo = Number(part_no);
    await prisma.booth.upsert({
      where: { partNo },
      create: {
        partNo,
        areaName: `Part ${partNo}`,
        pollingStationName: `Polling Station Part ${partNo}`,
        status: 'pending',
        voterCount: voters.length,
      },
      update: { voterCount: voters.length },
    });

    let imported = 0;
    for (let i = 0; i < voters.length; i += 1) {
      const v = voters[i];
      if (!v?.name) continue;
      const serial = Number(v.serial_no || i + 1);
      await prisma.elector.upsert({
        where: { partNo_serialNo: { partNo, serialNo: serial } },
        create: {
          partNo,
          serialNo: serial,
          epic: v.epic || null,
          name: String(v.name).slice(0, 200),
          relationType: ['father', 'mother', 'husband', 'other'].includes(
            String(v.relation_type || '').toLowerCase()
          )
            ? String(v.relation_type).toLowerCase()
            : 'father',
          relationName: v.relation_name || null,
          houseNo: v.house_no || null,
          age: v.age && Number(v.age) >= 18 && Number(v.age) <= 120 ? Number(v.age) : null,
          gender: ['M', 'F', 'O'].includes(String(v.gender || '').toUpperCase())
            ? String(v.gender).toUpperCase().slice(0, 1)
            : 'U',
          status: 'active',
          rawJson: v,
        },
        update: {
          epic: v.epic || null,
          name: String(v.name).slice(0, 200),
          houseNo: v.house_no || null,
          age: v.age && Number(v.age) >= 18 && Number(v.age) <= 120 ? Number(v.age) : null,
          gender: ['M', 'F', 'O'].includes(String(v.gender || '').toUpperCase())
            ? String(v.gender).toUpperCase().slice(0, 1)
            : 'U',
          rawJson: v,
        },
      });
      imported += 1;
    }

    await prisma.rollFile.upsert({
      where: { filename: `import-part-${partNo}.csv` },
      create: {
        filename: `import-part-${partNo}.csv`,
        partNo,
        parseStatus: 'ready',
        voterCount: imported,
        processedAt: new Date(),
      },
      update: {
        parseStatus: 'ready',
        voterCount: imported,
        processedAt: new Date(),
      },
    });

    ok(res, { part_no: partNo, imported });
  })
);

// ---------- Electors (Voters UI) ----------
const VOTER_STATUSES = ['active', 'visited', 'callback', 'shifted', 'deceased', 'duplicate', 'inactive'];
const VOTER_GENDERS = ['M', 'F', 'O', 'U'];
const VOTER_LEANS = ['strong_yes', 'lean_yes', 'undecided', 'lean_no', 'strong_no', 'unknown'];
const VOTER_RELATIONS = ['father', 'mother', 'husband', 'other'];
const AGE_BANDS = {
  '18-24': [18, 24],
  '25-34': [25, 34],
  '35-44': [35, 44],
  '45-59': [45, 59],
  '60+': [60, 200],
};
const AGE_BAND_CASE = Prisma.raw(
  "CASE WHEN age < 25 THEN '18-24' WHEN age < 35 THEN '25-34' WHEN age < 45 THEN '35-44' WHEN age < 60 THEN '45-59' ELSE '60+' END"
);
const VOTER_SORTS = {
  serial: 'serial_no',
  name: 'LOWER(name)',
  age: 'age',
  house: 'house_no',
  part: 'part_no',
};

/**
 * Build the WHERE clause shared by list, stats and export.
 * `omit` drops one filter so a chart can show its own alternatives
 * (e.g. the gender split while a gender filter is active).
 */
function voterWhere(query = {}, omit = null) {
  const c = [Prisma.sql`TRUE`];
  const q = String(query.q || '').trim();
  if (query.part && query.part !== 'all' && Number.isFinite(Number(query.part))) {
    c.push(Prisma.sql`part_no = ${Number(query.part)}`);
  }
  if (
    omit !== 'section' &&
    query.section &&
    query.section !== 'all' &&
    Number.isFinite(Number(query.section))
  ) {
    c.push(Prisma.sql`section_no = ${Number(query.section)}`);
  }
  if (omit !== 'status' && VOTER_STATUSES.includes(query.status)) {
    c.push(Prisma.sql`status = ${query.status}::voterdb.voter_status`);
  }
  if (omit !== 'gender' && VOTER_GENDERS.includes(query.gender)) {
    c.push(Prisma.sql`gender = ${query.gender}::voterdb.gender_code`);
  }
  if (omit !== 'support' && VOTER_LEANS.includes(query.support)) {
    c.push(Prisma.sql`support_lean = ${query.support}::voterdb.support_lean`);
  }
  if (omit !== 'age' && AGE_BANDS[query.age]) {
    const [lo, hi] = AGE_BANDS[query.age];
    c.push(Prisma.sql`age BETWEEN ${lo} AND ${hi}`);
  }
  if (omit !== 'missing') {
    const m = query.missing;
    if (m === 'epic') c.push(Prisma.sql`(epic IS NULL OR epic = '')`);
    else if (m === 'age') c.push(Prisma.sql`age IS NULL`);
    else if (m === 'house') c.push(Prisma.sql`(house_no IS NULL OR house_no = '')`);
    else if (m === 'gender') c.push(Prisma.sql`gender = 'U'::voterdb.gender_code`);
    else if (m === 'any') {
      c.push(
        Prisma.sql`(epic IS NULL OR epic = '' OR age IS NULL OR house_no IS NULL OR house_no = '' OR gender = 'U'::voterdb.gender_code)`
      );
    }
  }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const serial = /^\d{1,7}$/.test(q) ? Number(q) : null;
    c.push(
      serial != null
        ? Prisma.sql`(name ILIKE ${like} OR epic ILIKE ${like} OR house_no ILIKE ${like} OR relation_name ILIKE ${like} OR section_name ILIKE ${like} OR phone ILIKE ${like} OR serial_no = ${serial})`
        : Prisma.sql`(name ILIKE ${like} OR epic ILIKE ${like} OR house_no ILIKE ${like} OR relation_name ILIKE ${like} OR section_name ILIKE ${like} OR phone ILIKE ${like})`
    );
  }
  return Prisma.sql`WHERE ${Prisma.join(c, ' AND ')}`;
}

const VOTER_LIST_COLUMNS = Prisma.raw(`id, document_id, part_no, serial_no, epic, name,
  relation_type::text AS relation_type, relation_name, house_no, age, gender::text AS gender,
  page_no, section_no, section_name, status::text AS status, support_lean::text AS support_lean, phone`);

function voterOrder(query) {
  const col = VOTER_SORTS[query.sort] || VOTER_SORTS.serial;
  const dir = query.dir === 'desc' ? 'DESC' : 'ASC';
  return Prisma.raw(`ORDER BY ${col} ${dir} NULLS LAST, part_no ASC, serial_no ASC`);
}

app.get(
  '/api/voters',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 500);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset =
      req.query.offset != null ? Math.max(Number(req.query.offset) || 0, 0) : (page - 1) * limit;
    const where = voterWhere(req.query);
    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw`SELECT ${VOTER_LIST_COLUMNS} FROM voterdb.electors ${where} ${voterOrder(
        req.query
      )} LIMIT ${limit} OFFSET ${offset}`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM voterdb.electors ${where}`,
    ]);
    ok(res, {
      rows: rows.map((r) => ({ ...r, ...houseFields(r.house_no) })),
      total: totalRows[0].n,
      count: rows.length,
      page: Math.floor(offset / limit) + 1,
      page_size: limit,
    });
  })
);

app.get(
  '/api/voters/stats',
  asyncHandler(async (req, res) => {
    const q = req.query;
    const all = voterWhere(q);
    const byGender = voterWhere(q, 'gender');
    const byAge = voterWhere(q, 'age');
    const bySection = voterWhere(q, 'section');
    const byStatus = voterWhere(q, 'status');
    const bySupport = voterWhere(q, 'support');

    const [summary, genders, ageGender, sections, parts, statuses, supports] = await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS total,
               ROUND(AVG(age)::numeric, 1)::float AS avg_age,
               COUNT(*) FILTER (WHERE epic IS NOT NULL AND epic <> '')::int AS with_epic,
               COUNT(age)::int AS with_age,
               COUNT(*) FILTER (WHERE house_no IS NOT NULL AND house_no <> '')::int AS with_house,
               COUNT(*) FILTER (WHERE gender <> 'U'::voterdb.gender_code)::int AS with_gender,
               COUNT(*) FILTER (WHERE epic IS NULL OR epic = '' OR age IS NULL OR house_no IS NULL
                                 OR house_no = '' OR gender = 'U'::voterdb.gender_code)::int AS needs_check,
               COUNT(DISTINCT (part_no, house_no)) FILTER (WHERE house_no IS NOT NULL AND house_no <> '')::int AS households,
               COUNT(DISTINCT part_no)::int AS parts
        FROM voterdb.electors ${all}`,
      prisma.$queryRaw`
        SELECT gender::text AS key, COUNT(*)::int AS count
        FROM voterdb.electors ${byGender} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT ${AGE_BAND_CASE} AS band, gender::text AS gender, COUNT(*)::int AS count
        FROM voterdb.electors ${Prisma.sql`${byAge} AND age IS NOT NULL`}
        GROUP BY 1, 2`,
      prisma.$queryRaw`
        SELECT part_no, section_no, section_name, COUNT(*)::int AS count
        FROM voterdb.electors ${Prisma.sql`${bySection} AND section_no IS NOT NULL`}
        GROUP BY 1, 2, 3 ORDER BY part_no, section_no LIMIT 400`,
      prisma.$queryRaw`
        SELECT part_no, COUNT(*)::int AS count
        FROM voterdb.electors ${all} GROUP BY 1 ORDER BY count DESC, part_no LIMIT 15`,
      prisma.$queryRaw`
        SELECT status::text AS key, COUNT(*)::int AS count
        FROM voterdb.electors ${byStatus} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT support_lean::text AS key, COUNT(*)::int AS count
        FROM voterdb.electors ${bySupport} GROUP BY 1`,
    ]);

    const bands = Object.keys(AGE_BANDS).map((band) => {
      const row = { band, male: 0, female: 0, unknown: 0, total: 0 };
      for (const r of ageGender) {
        if (r.band !== band) continue;
        const g = r.gender === 'M' ? 'male' : r.gender === 'F' ? 'female' : 'unknown';
        row[g] += r.count;
        row.total += r.count;
      }
      return row;
    });

    ok(res, { ...summary[0], genders, age_bands: bands, sections, parts, statuses, supports });
  })
);

app.get(
  '/api/voters/export',
  asyncHandler(async (req, res) => {
    const rows = await prisma.$queryRaw`SELECT ${VOTER_LIST_COLUMNS} FROM voterdb.electors ${voterWhere(
      req.query
    )} ${voterOrder(req.query)} LIMIT 50000`;
    const head = [
      'Booth',
      'Serial',
      'Voter ID',
      'Name',
      'Relation',
      'Relative name',
      'House number',
      'Address note',
      'Age',
      'Gender',
      'Road',
      'Status',
      'Support',
      'Phone',
    ];
    const cell = (v) => {
      const t = v == null ? '' : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.part_no,
          r.serial_no,
          r.epic,
          r.name,
          r.relation_type,
          r.relation_name,
          splitHouse(r.house_no).number,
          splitHouse(r.house_no).note,
          r.age,
          r.gender,
          r.section_name,
          r.status,
          r.support_lean,
          r.phone,
        ]
          .map(cell)
          .join(',')
      );
    }
    ok(res, { count: rows.length, csv: lines.join('\n') });
  })
);

app.get(
  '/api/voters/:id',
  asyncHandler(async (req, res) => {
    const voter = await prisma.elector.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!voter) return fail(res, 404, 'Voter not found');
    await hydrateElectorExtras(voter);
    const outreach = await prisma.outreach.findMany({
      where: { electorId: voter.id },
      orderBy: { id: 'desc' },
    });

    let roll_info = null;
    let has_photo = false;
    let page_image_url = null;
    let cover_pages = [];
    if (voter.documentId) {
      const doc = await prisma.extractedDocument.findUnique({
        where: { id: voter.documentId },
        select: { id: true, filename: true, rawMeta: true, partNo: true },
      });
      const meta = doc?.rawMeta && typeof doc.rawMeta === 'object' ? doc.rawMeta : {};
      roll_info = meta.roll_info || null;
      has_photo = isTeluguRoll(doc?.filename);
      if (doc?.filename && voter.pageNo != null) {
        const img = pageImagePath(doc.filename, voter.pageNo);
        if (img) page_image_url = `/api/documents/${doc.id}/pages/${voter.pageNo}/image`;
      }
      const pages = await prisma.extractedPage.findMany({
        where: { documentId: voter.documentId, pageNo: { in: [1, 2] } },
        orderBy: { pageNo: 'asc' },
        select: { pageNo: true, text: true, charCount: true, image: true },
      });
      cover_pages = pages.map((p) => ({
        page_no: p.pageNo,
        text: p.text,
        char_count: p.charCount,
        image_url: `/api/documents/${doc.id}/pages/${p.pageNo}/image`,
      }));
      if (!page_image_url && voter.pageNo != null) {
        page_image_url = `/api/documents/${doc.id}/pages/${voter.pageNo}/image`;
      }
    }

    let household = [];
    if (voter.houseNo) {
      household = await prisma.$queryRaw`
        SELECT id, name, age, gender::text AS gender, relation_type::text AS relation_type,
               relation_name, status::text AS status
        FROM voterdb.electors
        WHERE part_no = ${voter.partNo} AND house_no = ${voter.houseNo} AND id <> ${voter.id}
        ORDER BY serial_no LIMIT 15`;
    }

    const boothRow = await prisma.booth.findUnique({
      where: { partNo: voter.partNo },
      include: { ward: { select: { wardNo: true, name: true } } },
    });
    const booth = boothRow && {
      part_no: boothRow.partNo,
      polling_station_name: boothRow.pollingStationName,
      polling_station_address: boothRow.pollingStationAddress,
      area_name: boothRow.areaName,
      ward: boothRow.ward ? `Ward ${boothRow.ward.wardNo} · ${boothRow.ward.name}` : null,
      agent_name: boothRow.agentName,
      coordinator_name: boothRow.coordinatorName,
      voter_count: boothRow.voterCount,
    };

    ok(res, {
      ...voter,
      booth,
      card_image_url: voter.documentId && voter.pageNo != null ? `/api/voters/${voter.id}/card-image` : null,
      photo_url: has_photo ? `/api/voters/${voter.id}/photo` : null,
      ...houseFields(voter.houseNo),
      household,
      outreach,
      roll_info,
      page_image_url,
      cover_pages,
      road:
        voter.sectionName != null
          ? `${voter.sectionNo != null ? `${voter.sectionNo}-` : ''}${voter.sectionName}`
          : null,
    });
  })
);

// A voter's own card, cropped from the roll PDF (small image, cached on disk).
// Cards sit on a fixed 3 x 10 grid; positions are fractions of the page.
const CARD_COL_LEFT = [0.0248, 0.3447, 0.6638];
const CARD_ROW_TOP = [0.034, 0.1285, 0.2225, 0.317, 0.411, 0.505, 0.5995, 0.6935, 0.7875, 0.882];

function pdfPageSize(pdftoppm, pdfPath) {
  const { spawnSync } = require('child_process');
  const pdfinfo = path.join(path.dirname(pdftoppm), path.basename(pdftoppm).replace(/pdftoppm/i, 'pdfinfo'));
  const out = spawnSync(fs.existsSync(pdfinfo) ? pdfinfo : 'pdfinfo', [pdfPath], { windowsHide: true, timeout: 20000 });
  const m = String(out.stdout || '').match(/Page size:\s*([\d.]+)\s*x\s*([\d.]+)/i);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 595.3, h: 841.9 }; // A4
}

app.get(
  '/api/voters/:id/card-image',
  asyncHandler(async (req, res) => {
    const voter = await prisma.elector.findUnique({
      where: { id: BigInt(req.params.id) },
      select: { documentId: true, pageNo: true, serialNo: true },
    });
    if (!voter?.documentId || voter.pageNo == null) return fail(res, 404, 'Card not available');
    const doc = await prisma.extractedDocument.findUnique({
      where: { id: voter.documentId },
      select: { filename: true, storagePath: true },
    });
    if (!doc) return fail(res, 404, 'Card not available');

    const stem = path.parse(doc.filename).name;
    const cacheDir = path.join(OCR_PAGE_IMAGES_DIR, stem);
    const cached = path.join(cacheDir, `card-${voter.serialNo}.png`);
    if (!fs.existsSync(cached)) {
      const pdfPath = findRollPdf(doc);
      if (!pdfPath) return fail(res, 404, 'Roll file not available');

      const first = await prisma.$queryRaw`
        SELECT MIN(serial_no)::int AS n FROM voterdb.electors
        WHERE document_id = ${voter.documentId} AND page_no = ${voter.pageNo}`;
      const slot = voter.serialNo - (first[0]?.n ?? voter.serialNo);
      if (slot < 0 || slot > 29) return fail(res, 404, 'Card not available');

      const pdftoppm = findPdftoppm();
      const dpi = 220;
      const size = pdfPageSize(pdftoppm, pdfPath);
      const pxW = (size.w * dpi) / 72;
      const pxH = (size.h * dpi) / 72;
      const col = slot % 3;
      const row = Math.floor(slot / 3);
      const x = Math.max(0, Math.round((CARD_COL_LEFT[col] - 0.004) * pxW));
      const y = Math.max(0, Math.round((CARD_ROW_TOP[row] - 0.003) * pxH));
      const w = Math.round(0.318 * pxW);
      const h = Math.round(0.096 * pxH);

      fs.mkdirSync(cacheDir, { recursive: true });
      const { spawnSync } = require('child_process');
      const prefix = path.join(cacheDir, `card-${voter.serialNo}`);
      const run = spawnSync(
        pdftoppm,
        ['-png', '-r', String(dpi), '-f', String(voter.pageNo), '-l', String(voter.pageNo), '-x', String(x), '-y', String(y), '-W', String(w), '-H', String(h), '-singlefile', pdfPath, prefix],
        { windowsHide: true, timeout: 60000 }
      );
      if (run.error) console.warn('card image render:', run.error.message);
      if (!fs.existsSync(cached)) return fail(res, 404, 'Card image not available');
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(path.resolve(cached));
  })
);

// A voter's photo, cut out of their printed card. Telugu rolls print a photo on every card; the English rolls only say "Photo Available".
const isTeluguRoll = (filename) => /[-_]TEL[-_]\d+/i.test(String(filename || ''));
app.get(
  '/api/voters/:id/photo',
  asyncHandler(async (req, res) => {
    const voter = await prisma.elector.findUnique({
      where: { id: BigInt(req.params.id) },
      select: { documentId: true, pageNo: true, serialNo: true },
    });
    if (!voter?.documentId || voter.pageNo == null) return fail(res, 404, 'No photo');
    const doc = await prisma.extractedDocument.findUnique({ where: { id: voter.documentId }, select: { filename: true, storagePath: true } });
    if (!doc || !isTeluguRoll(doc.filename)) return fail(res, 404, 'No photo');

    const cacheDir = path.join(OCR_PAGE_IMAGES_DIR, path.parse(doc.filename).name);
    const cached = path.join(cacheDir, `photo-${voter.serialNo}.jpg`);
    const missing = path.join(cacheDir, `photo-${voter.serialNo}.none`); // remembers "this card has no picture"
    if (fs.existsSync(missing)) return fail(res, 404, 'No photo');

    if (!fs.existsSync(cached)) {
      const pdfPath = findRollPdf(doc);
      if (!pdfPath) return fail(res, 404, 'No photo');
      const first = await prisma.$queryRaw`
        SELECT MIN(serial_no)::int AS n FROM voterdb.electors WHERE document_id = ${voter.documentId} AND page_no = ${voter.pageNo}`;
      const slot = voter.serialNo - (first[0]?.n ?? voter.serialNo);
      if (slot < 0 || slot > 29) return fail(res, 404, 'No photo');

      const pdftoppm = findPdftoppm();
      const dpi = 200;
      const size = pdfPageSize(pdftoppm, pdfPath);
      const pxW = (size.w * dpi) / 72;
      const pxH = (size.h * dpi) / 72;
      const cardX = (CARD_COL_LEFT[slot % 3] - 0.004) * pxW;
      const cardY = (CARD_ROW_TOP[Math.floor(slot / 3)] - 0.003) * pxH;
      const cardW = 0.318 * pxW;
      const cardH = 0.096 * pxH;
      // the photo frame sits at the right of the card
      const x = Math.round(cardX + cardW * 0.752);
      const y = Math.round(cardY + cardH * 0.215);
      const w = Math.round(cardW * 0.213);
      const h = Math.round(cardH * 0.575);

      fs.mkdirSync(cacheDir, { recursive: true });
      const { spawnSync } = require('child_process');
      spawnSync(
        pdftoppm,
        ['-jpeg', '-r', String(dpi), '-f', String(voter.pageNo), '-l', String(voter.pageNo), '-x', String(x), '-y', String(y), '-W', String(w), '-H', String(h), '-singlefile', pdfPath, path.join(cacheDir, `photo-${voter.serialNo}`)],
        { windowsHide: true, timeout: 60000 }
      );
      if (!fs.existsSync(cached)) return fail(res, 404, 'No photo');
      // An empty frame (text only) is almost one flat colour; a real photo is not.
      try {
        const stats = await require('sharp')(cached).stats();
        const spread = stats.channels.reduce((a, c) => a + c.stdev, 0) / stats.channels.length;
        if (spread < 22) {
          fs.unlinkSync(cached);
          fs.writeFileSync(missing, '');
          return fail(res, 404, 'No photo');
        }
      } catch {
        /* if the check itself fails, show what was cut out */
      }
    }
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(path.resolve(cached));
  })
);

app.get(
  '/api/documents/:id/pages/:pageNo/image',
  asyncHandler(async (req, res) => {
    const doc = await prisma.extractedDocument.findUnique({
      where: { id: BigInt(req.params.id) },
      select: { filename: true, storagePath: true },
    });
    if (!doc) return fail(res, 404, 'Document not found');
    const pageNo = Number(req.params.pageNo);
    let img = pageImagePath(doc.filename, pageNo);
    if (!img) {
      // Try generate once from stored PDF (cover / voter page preview)
      const pdfPath = findRollPdf(doc);
      if (pdfPath) {
        try {
          const { spawnSync } = require('child_process');
          const stem = path.parse(doc.filename).name;
          const outDir = path.join(OCR_PAGE_IMAGES_DIR, stem);
          fs.mkdirSync(outDir, { recursive: true });
          const outPrefix = path.join(outDir, `page-${pageNo}`);
          const pdftoppm = findPdftoppm();
          const rendered = spawnSync(
            pdftoppm,
            ['-png', '-r', '200', '-f', String(pageNo), '-l', String(pageNo), '-singlefile', pdfPath, outPrefix],
            { windowsHide: true, timeout: 60000 }
          );
          if (rendered.error) console.warn('page image render:', rendered.error.message);
          img = pageImagePath(doc.filename, pageNo);
        } catch (err) {
          console.warn('page image render:', err.message);
        }
      }
    }
    if (!img) return fail(res, 404, 'Page image not available');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(path.resolve(img));
  })
);

app.get(
  '/api/parts/:part/roll-info',
  asyncHandler(async (req, res) => {
    const partNo = Number(req.params.part);
    const doc = await prisma.extractedDocument.findFirst({
      where: { partNo },
      orderBy: { id: 'desc' },
      select: { id: true, filename: true, rawMeta: true, pageCount: true },
    });
    if (!doc) return fail(res, 404, 'No roll for this part');
    const meta = doc.rawMeta && typeof doc.rawMeta === 'object' ? doc.rawMeta : {};
    const pages = await prisma.extractedPage.findMany({
      where: { documentId: doc.id, pageNo: { in: [1, 2] } },
      orderBy: { pageNo: 'asc' },
      select: { pageNo: true, text: true, charCount: true },
    });
    ok(res, {
      document_id: doc.id,
      filename: doc.filename,
      page_count: doc.pageCount,
      roll_info: meta.roll_info || null,
      cover_pages: pages.map((p) => ({
        page_no: p.pageNo,
        text: p.text,
        char_count: p.charCount,
        image_url: `/api/documents/${doc.id}/pages/${p.pageNo}/image`,
      })),
    });
  })
);

app.post(
  '/api/data/enrich-roll-meta',
  asyncHandler(async (_req, res) => {
    const { enrichAllDocuments } = require(path.resolve(
      __dirname,
      '../eluru_voters_data_ocr_extraction/code/saveToDb'
    ));
    const result = await enrichAllDocuments();
    ok(res, result);
  })
);

app.patch(
  '/api/voters/:id',
  asyncHandler(async (req, res) => {
    const id = BigInt(req.params.id);
    const existing = await prisma.elector.findUnique({ where: { id } });
    if (!existing) return fail(res, 404, 'Voter not found');
    const b = req.body || {};
    const data = {};
    if (b.status !== undefined) {
      if (!VOTER_STATUSES.includes(b.status)) return fail(res, 400, 'Invalid status');
      data.status = b.status;
    }
    if (b.support_lean !== undefined) {
      if (!VOTER_LEANS.includes(b.support_lean)) return fail(res, 400, 'Invalid support level');
      data.supportLean = b.support_lean;
    }
    if (b.phone !== undefined) {
      const phone = String(b.phone || '').replace(/[^\d+]/g, '');
      if (phone && (phone.length < 7 || phone.length > 15)) {
        return fail(res, 400, 'Enter a valid phone number');
      }
      data.phone = phone || null;
    }
    if (b.name !== undefined) {
      const name = String(b.name || '').trim().slice(0, 200);
      if (!name) return fail(res, 400, 'Name cannot be empty');
      data.name = name;
      data.nameNormalized = name.toLowerCase();
    }
    if (b.relation_name !== undefined) {
      data.relationName = String(b.relation_name || '').trim().slice(0, 200) || null;
    }
    if (b.relation_type !== undefined) {
      if (!VOTER_RELATIONS.includes(b.relation_type)) return fail(res, 400, 'Invalid relation');
      data.relationType = b.relation_type;
    }
    if (b.house_no !== undefined) data.houseNo = String(b.house_no || '').trim().slice(0, 40) || null;
    if (b.epic !== undefined) {
      const epic = String(b.epic || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');
      data.epic = epic || null;
    }
    if (b.age !== undefined) {
      if (b.age === null || b.age === '') data.age = null;
      else {
        const age = Number(b.age);
        if (!Number.isInteger(age) || age < 18 || age > 120) {
          return fail(res, 400, 'Age must be between 18 and 120');
        }
        data.age = age;
      }
    }
    if (b.gender !== undefined) {
      if (!VOTER_GENDERS.includes(b.gender)) return fail(res, 400, 'Invalid gender');
      data.gender = b.gender;
    }
    if (!Object.keys(data).length) return fail(res, 400, 'Nothing to update');
    const voter = await prisma.elector.update({ where: { id }, data });
    const before = {};
    const after = {};
    for (const key of Object.keys(data)) {
      if (String(existing[key] ?? '') !== String(voter[key] ?? '')) {
        before[key] = existing[key] ?? null;
        after[key] = voter[key] ?? null;
      }
    }
    if (Object.keys(after).length) {
      await logAudit(prisma, {
        entity: 'voter',
        entityId: id,
        action: 'update',
        ...actorOf(req),
        summary: `Edited ${Object.keys(after).join(', ')}`,
        before,
        after,
      });
    }
    ok(res, voter);
  })
);

app.get(
  '/api/voters/:id/history',
  asyncHandler(async (req, res) => {
    const rows = await prisma.$queryRaw`
      SELECT id, action, actor_role, summary, before_data, after_data, created_at
      FROM public.audit_log WHERE entity = 'voter' AND entity_id = ${BigInt(req.params.id)}
      ORDER BY created_at DESC, id DESC`;
    ok(res, rows);
  })
);

// ---------- Booths ----------
const BOOTH_STATUSES = ['pending', 'active', 'complete', 'inactive'];

/**
 * One row per booth with live figures from the voter data. "Reached" counts voters who
 * have been visited / called back / marked, or who have any contact logged.
 */
async function loadBoothSummaries(partNo = null) {
  const only = partNo != null ? Prisma.sql`WHERE b.part_no = ${partNo}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    WITH e AS (
      SELECT part_no,
             COUNT(*)::int AS voters,
             COUNT(*) FILTER (WHERE gender = 'M'::voterdb.gender_code)::int AS male,
             COUNT(*) FILTER (WHERE gender = 'F'::voterdb.gender_code)::int AS female,
             COUNT(DISTINCT house_no) FILTER (WHERE house_no IS NOT NULL AND house_no <> '')::int AS households,
             COUNT(DISTINCT section_no)::int AS roads,
             ROUND(AVG(age)::numeric, 1)::float AS avg_age,
             COUNT(*) FILTER (WHERE epic IS NOT NULL AND epic <> '')::int AS with_epic,
             COUNT(*) FILTER (
               WHERE status <> 'active'::voterdb.voter_status
                  OR EXISTS (SELECT 1 FROM public.outreach o WHERE o.elector_id = voterdb.electors.id)
             )::int AS reached
      FROM voterdb.electors
      GROUP BY part_no
    )
    SELECT b.part_no, b.polling_station_name, b.polling_station_address, b.area_name,
           b.ac_code, b.ac_name, b.agent_name, b.coordinator_name, b.status::text AS status,
           b.lat, b.lng, b.ward_id, w.ward_no, w.name AS ward_name,
           COALESCE(e.voters, 0) AS voters,
           COALESCE(e.male, 0) AS male,
           COALESCE(e.female, 0) AS female,
           COALESCE(e.households, 0) AS households,
           COALESCE(e.roads, 0) AS roads,
           e.avg_age,
           COALESCE(e.with_epic, 0) AS with_epic,
           COALESCE(e.reached, 0) AS reached
    FROM public.booths b
    LEFT JOIN e ON e.part_no = b.part_no
    LEFT JOIN public.wards w ON w.id = b.ward_id
    ${only}
    ORDER BY b.part_no`;
  return rows.map((r) => ({
    ...r,
    voter_count: r.voters,
    unknown: Math.max(0, r.voters - r.male - r.female),
    coverage_pct: r.voters ? Math.round((1000 * r.reached) / r.voters) / 10 : 0,
  }));
}

app.get(
  '/api/booths',
  asyncHandler(async (_req, res) => {
    ok(res, await loadBoothSummaries());
  })
);

app.get(
  '/api/booths/:part',
  asyncHandler(async (req, res) => {
    const partNo = Number(req.params.part);
    const [booth] = await loadBoothSummaries(partNo);
    if (!booth) return fail(res, 404, 'Booth not found');

    const [roads, ageRows, docs] = await Promise.all([
      prisma.$queryRaw`
        SELECT section_no, section_name, COUNT(*)::int AS count
        FROM voterdb.electors WHERE part_no = ${partNo} AND section_no IS NOT NULL
        GROUP BY 1, 2 ORDER BY section_no`,
      prisma.$queryRaw`
        SELECT ${AGE_BAND_CASE} AS band, gender::text AS gender, COUNT(*)::int AS count
        FROM voterdb.electors WHERE part_no = ${partNo} AND age IS NOT NULL GROUP BY 1, 2`,
      prisma.$queryRaw`
        SELECT id, page_count, raw_meta FROM voterdb.extracted_documents WHERE part_no = ${partNo} LIMIT 1`,
    ]);

    const age_bands = Object.keys(AGE_BANDS).map((band) => {
      const row = { band, male: 0, female: 0, unknown: 0, total: 0 };
      for (const r of ageRows) {
        if (r.band !== band) continue;
        const g = r.gender === 'M' ? 'male' : r.gender === 'F' ? 'female' : 'unknown';
        row[g] += r.count;
        row.total += r.count;
      }
      return row;
    });

    const meta = docs[0]?.raw_meta && typeof docs[0].raw_meta === 'object' ? docs[0].raw_meta : {};
    // Pages of the printed roll that describe the booth: cover (areas, polling station), summary, last page.
    const doc = docs[0];
    const pageNos = doc ? [...new Set([1, 2, doc.page_count > 2 ? doc.page_count : null].filter(Boolean))] : [];
    const pageLabel = (n) => (n === 1 ? 'Cover page' : n === 2 ? 'Roll summary' : 'Last page');
    const media = pageNos.map((n) => ({
      page_no: n,
      label: pageLabel(n),
      url: `/api/documents/${doc.id}/pages/${n}/image`,
    }));

    const pics = await prisma.$queryRaw`
      SELECT kind, label, width, height FROM public.booth_media WHERE part_no = ${partNo}`;
    const order = ['nazri_naksha', 'google_map', 'building_front', 'station_front', 'cad_view', 'key_map'];
    const pictures = pics
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
      .map((p) => ({ ...p, url: `/api/booths/${partNo}/media/${p.kind}` }));

    ok(res, { ...booth, roads_list: roads, age_bands, roll_info: meta.roll_info || null, media, pictures });
  })
);

// A booth picture (map, building photo, plan) stored in the database.
app.get(
  '/api/booths/:part/media/:kind',
  asyncHandler(async (req, res) => {
    const rows = await prisma.$queryRaw`
      SELECT mime, data FROM public.booth_media WHERE part_no = ${Number(req.params.part)} AND kind = ${String(req.params.kind)}`;
    if (!rows.length) return fail(res, 404, 'Picture not found');
    res.setHeader('Content-Type', rows[0].mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(rows[0].data));
  })
);

app.patch(
  '/api/booths/:part',
  asyncHandler(async (req, res) => {
    const partNo = Number(req.params.part);
    const { agent_name, coverage_pct, status, coordinator_name, lat, lng } = req.body || {};
    const coord = (v, limit) => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && Math.abs(n) <= limit ? n : NaN;
    };
    const nextLat = coord(lat, 90);
    const nextLng = coord(lng, 180);
    if (Number.isNaN(nextLat) || Number.isNaN(nextLng)) return fail(res, 400, 'Enter a valid latitude and longitude');
    if (status !== undefined && !BOOTH_STATUSES.includes(status)) return fail(res, 400, 'Invalid status');
    const clean = (v) => {
      const t = String(v ?? '').trim().slice(0, 120);
      return t || null;
    };
    const existing = await prisma.booth.findUnique({ where: { partNo } });
    if (!existing) return fail(res, 404, 'Booth not found');
    const booth = await prisma.booth.update({
      where: { partNo },
      data: {
        ...(agent_name !== undefined ? { agentName: clean(agent_name) } : {}),
        ...(coverage_pct !== undefined ? { coveragePct: coverage_pct } : {}),
        ...(status ? { status } : {}),
        ...(coordinator_name !== undefined ? { coordinatorName: clean(coordinator_name) } : {}),
        ...(nextLat !== undefined ? { lat: nextLat } : {}),
        ...(nextLng !== undefined ? { lng: nextLng } : {}),
      },
    });
    ok(res, booth);
  })
);

// ---------- Page routes (one module per page) ----------
require('./routes/auth')({ app, prisma, fail, ok, asyncHandler, auth });
require('./routes/access')({ app, prisma, fail, ok, asyncHandler, auth });

require('./routes')({
  app,
  prisma,
  Prisma,
  ok,
  fail,
  asyncHandler,
  loadBoothSummaries,
  houseFields,
});

app.get(
  '/api/settings',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.setting.findMany();
    const map = {};
    rows.forEach((r) => {
      map[r.key] = r.value;
    });
    ok(res, map);
  })
);

app.patch(
  '/api/settings/:key',
  asyncHandler(async (req, res) => {
    const value = req.body?.value ?? req.body ?? {};
    await prisma.setting.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value },
      update: { value },
    });
    ok(res, { key: req.params.key, value });
  })
);

app.use((err, _req, res, _next) => {
  console.error(err);
  const raw = String(err?.message || 'Server error');
  const friendly =
    /Invalid.*OutreachType|Invalid value for argument/i.test(raw)
      ? 'Could not save — check the fields and try again.'
      : /prisma|invocation/i.test(raw)
        ? 'Could not save. Please try again.'
        : raw.slice(0, 200);
  fail(res, 500, friendly);
});

initDb()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`CivicPulse API http://localhost:${PORT}/api`);
      console.log(`DB ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);
      console.log(`OCR uploads → ${OCR_UPLOAD_DIR}`);
      console.log(`OCR recover → ${OCR_EXTRACT_URL}/api/recover`);
    });
    server.keepAliveTimeout = 65000; // longer than Nginx's idle timeout
    const stop = () => server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  })
  .catch((err) => {
    console.error('DB connect failed:', err.message);
    process.exit(1);
  });

process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));
