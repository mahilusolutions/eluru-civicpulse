const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Prisma } = require('@prisma/client');
const { prisma, initDb, DATABASE_URL } = require('./db');
const { serialize } = require('./lib/serialize');
const { parseFilename } = require('./services/parseFilename');

const app = express();
const PORT = process.env.PORT || 4000;
const OCR_UPLOAD_DIR =
  process.env.OCR_UPLOAD_DIR ||
  path.resolve(__dirname, '../eluru_voters_data_ocr_extraction/uploaded_files');
const OCR_EXTRACT_URL = process.env.OCR_EXTRACT_URL || 'http://127.0.0.1:2000';

app.use(cors());
app.use(express.json({ limit: '20mb' }));

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

app.get(
  '/api/dashboard/summary',
  asyncHandler(async (_req, res) => {
    const [booths, electors, coverage, openIssues, files] = await Promise.all([
      prisma.booth.count(),
      prisma.elector.count(),
      prisma.booth.aggregate({ _avg: { coveragePct: true } }),
      prisma.issue.count({ where: { NOT: { status: 'Resolved' } } }),
      prisma.rollFile.count(),
    ]);
    const topBooths = await prisma.booth.findMany({
      orderBy: { coveragePct: 'desc' },
      take: 8,
      select: {
        partNo: true,
        areaName: true,
        agentName: true,
        coveragePct: true,
        voterCount: true,
        status: true,
      },
    });
    const recentIssues = await prisma.issue.findMany({
      orderBy: { id: 'desc' },
      take: 8,
      select: {
        id: true,
        title: true,
        priority: true,
        status: true,
        partNo: true,
        createdAt: true,
      },
    });
    const avg = coverage._avg.coveragePct ? Number(coverage._avg.coveragePct) : 0;
    ok(res, {
      stats: [
        { label: 'Booth parts', value: String(booths), hint: 'Parts with rolls loaded' },
        { label: 'Voters', value: String(electors), hint: 'People on the voter list' },
        { label: 'Avg coverage', value: `${Math.round(avg)}%`, hint: 'Door visits done' },
        { label: 'Open issues', value: String(openIssues), hint: 'Problems still open' },
      ],
      files,
      topBooths,
      recentIssues,
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
app.get(
  '/api/voters',
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    const part = req.query.part;
    const status = req.query.status;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const where = {};
    if (part && part !== 'all') where.partNo = Number(part);
    if (status && status !== 'all') where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { epic: { contains: q, mode: 'insensitive' } },
        { houseNo: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.elector.findMany({
        where,
        orderBy: [{ partNo: 'asc' }, { serialNo: 'asc' }],
        take: limit,
      }),
      prisma.elector.count(),
    ]);
    ok(res, { rows, total, count: rows.length });
  })
);

app.get(
  '/api/voters/:id',
  asyncHandler(async (req, res) => {
    const voter = await prisma.elector.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!voter) return fail(res, 404, 'Voter not found');
    const outreach = await prisma.outreach.findMany({
      where: { electorId: voter.id },
      orderBy: { id: 'desc' },
    });
    ok(res, { ...voter, outreach });
  })
);

app.patch(
  '/api/voters/:id',
  asyncHandler(async (req, res) => {
    const id = BigInt(req.params.id);
    const existing = await prisma.elector.findUnique({ where: { id } });
    if (!existing) return fail(res, 404, 'Voter not found');
    const { status, phone, support_lean } = req.body || {};
    const voter = await prisma.elector.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(support_lean ? { supportLean: support_lean } : {}),
      },
    });
    ok(res, voter);
  })
);

app.get(
  '/api/booths',
  asyncHandler(async (_req, res) => {
    ok(res, await prisma.booth.findMany({ orderBy: { partNo: 'asc' } }));
  })
);

app.get(
  '/api/booths/:part',
  asyncHandler(async (req, res) => {
    const partNo = Number(req.params.part);
    const booth = await prisma.booth.findUnique({ where: { partNo } });
    if (!booth) return fail(res, 404, 'Booth not found');
    const voterCount = await prisma.elector.count({ where: { partNo } });
    ok(res, { ...booth, voter_count: voterCount });
  })
);

app.patch(
  '/api/booths/:part',
  asyncHandler(async (req, res) => {
    const partNo = Number(req.params.part);
    const { agent_name, coverage_pct, status, coordinator_name } = req.body || {};
    const booth = await prisma.booth.update({
      where: { partNo },
      data: {
        ...(agent_name !== undefined ? { agentName: agent_name } : {}),
        ...(coverage_pct !== undefined ? { coveragePct: coverage_pct } : {}),
        ...(status ? { status } : {}),
        ...(coordinator_name !== undefined ? { coordinatorName: coordinator_name } : {}),
      },
    });
    ok(res, booth);
  })
);

app.get(
  '/api/households',
  asyncHandler(async (req, res) => {
    const part = req.query.part;
    const partFilter =
      part && part !== 'all' ? Prisma.sql`AND part_no = ${Number(part)}` : Prisma.empty;
    // Skip OCR header junk that was mis-read as voter names
    const rows = await prisma.$queryRaw`
      SELECT part_no,
             house_no,
             COUNT(*)::int AS member_count,
             MIN(name) AS head_name
      FROM voterdb.electors
      WHERE house_no IS NOT NULL
        AND house_no <> ''
        AND name !~* 'part\\s*number|section\\s*no|assembly|constituency|electoral|revision|polling|eluru|s01-?65|e-?roll|draft\\s*roll|photo\\s*available'
        AND name !~ '^[0-9]{1,3}[-–]'
        AND length(regexp_replace(name, '[^A-Za-z\\u0C00-\\u0C7F]', '', 'g')) >= 3
        ${partFilter}
      GROUP BY part_no, house_no
      ORDER BY part_no ASC, house_no ASC
      LIMIT 500
    `;
    ok(
      res,
      rows.map((r) => ({
        part_no: r.part_no,
        house_no: r.house_no,
        member_count: r.member_count,
        head_name: r.head_name,
      }))
    );
  })
);

app.get(
  '/api/wards',
  asyncHandler(async (_req, res) => {
    const wards = await prisma.ward.findMany({
      orderBy: { wardNo: 'asc' },
      include: { wardBooths: { select: { partNo: true }, orderBy: { partNo: 'asc' } } },
    });
    ok(
      res,
      wards.map((w) => ({
        ...w,
        parts: w.wardBooths.map((x) => x.partNo),
      }))
    );
  })
);

app.get(
  '/api/outreach',
  asyncHandler(async (req, res) => {
    const voterId = req.query.voter_id;
    const rows = await prisma.outreach.findMany({
      where: voterId ? { electorId: BigInt(voterId) } : undefined,
      include: { elector: { select: { name: true, partNo: true } } },
      orderBy: { id: 'desc' },
      take: voterId ? undefined : 100,
    });
    ok(
      res,
      rows.map((o) => ({
        ...o,
        type: OUTREACH_TYPE_OUT[o.type] || o.type,
        voter_name: o.elector?.name,
        part_no: o.elector?.partNo,
        voter_id: o.electorId,
      }))
    );
  })
);

const OUTREACH_TYPE_IN = {
  visit: 'door',
  door: 'door',
  call: 'phone',
  phone: 'phone',
  whatsapp: 'whatsapp',
  sms: 'sms',
  event: 'event',
  other: 'other',
};
const OUTREACH_TYPE_OUT = {
  door: 'Visit',
  phone: 'Call',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  event: 'Event',
  other: 'Other',
};

app.post(
  '/api/outreach',
  asyncHandler(async (req, res) => {
    const { voter_id, type, outcome, notes, created_by_role } = req.body || {};
    if (!voter_id || !type) return fail(res, 400, 'voter_id and type required');
    const mapped = OUTREACH_TYPE_IN[String(type).toLowerCase()];
    if (!mapped) return fail(res, 400, 'Invalid type');
    const row = await prisma.outreach.create({
      data: {
        electorId: BigInt(voter_id),
        type: mapped,
        outcome: outcome || null,
        notes: notes || null,
        createdByRole: created_by_role || null,
      },
    });
    ok(res, { ...row, type: OUTREACH_TYPE_OUT[row.type] || row.type });
  })
);

app.get(
  '/api/issues',
  asyncHandler(async (_req, res) => {
    ok(res, await prisma.issue.findMany({ orderBy: { id: 'desc' } }));
  })
);

app.post(
  '/api/issues',
  asyncHandler(async (req, res) => {
    const { title, description, ward_id, part_no, priority, reporter_role } = req.body || {};
    if (!title) return fail(res, 400, 'title required');
    const row = await prisma.issue.create({
      data: {
        title,
        description: description || null,
        wardId: ward_id ? BigInt(ward_id) : null,
        partNo: part_no ? Number(part_no) : null,
        priority: priority || 'Medium',
        reporterRole: reporter_role || null,
      },
    });
    ok(res, row);
  })
);

app.patch(
  '/api/issues/:id',
  asyncHandler(async (req, res) => {
    const { status, priority } = req.body || {};
    const data = {};
    if (status) data.status = status === 'In progress' ? 'In_progress' : status;
    if (priority) data.priority = priority;
    const row = await prisma.issue.update({
      where: { id: BigInt(req.params.id) },
      data,
    });
    ok(res, row);
  })
);

app.get(
  '/api/surveys',
  asyncHandler(async (_req, res) => {
    const surveys = await prisma.survey.findMany({
      orderBy: { id: 'desc' },
      include: { responses: { orderBy: { id: 'desc' } } },
    });
    ok(res, surveys);
  })
);

app.post(
  '/api/surveys/:id/responses',
  asyncHandler(async (req, res) => {
    const { answer, part_no, respondent_name, created_by_role } = req.body || {};
    if (!answer) return fail(res, 400, 'answer required');
    const row = await prisma.surveyResponse.create({
      data: {
        surveyId: BigInt(req.params.id),
        partNo: part_no ? Number(part_no) : null,
        answer,
        respondentName: respondent_name || null,
        createdByRole: created_by_role || null,
      },
    });
    ok(res, row);
  })
);

app.get(
  '/api/election-day',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.electionDayStats.findMany({
      orderBy: { partNo: 'asc' },
      include: {
        booth: { select: { areaName: true, agentName: true, voterCount: true } },
      },
    });
    ok(
      res,
      rows.map((e) => ({
        ...e,
        area_name: e.booth?.areaName,
        agent_name: e.booth?.agentName,
        voter_count: e.booth?.voterCount,
      }))
    );
  })
);

app.patch(
  '/api/election-day/:part',
  asyncHandler(async (req, res) => {
    const partNo = Number(req.params.part);
    const { slip_printed, voted_count, missing_count, turnout_pct } = req.body || {};
    const row = await prisma.electionDayStats.upsert({
      where: { partNo },
      create: {
        partNo,
        slipPrinted: slip_printed ?? 0,
        votedCount: voted_count ?? 0,
        missingCount: missing_count ?? 0,
        turnoutPct: turnout_pct ?? 0,
      },
      update: {
        ...(slip_printed !== undefined ? { slipPrinted: slip_printed } : {}),
        ...(voted_count !== undefined ? { votedCount: voted_count } : {}),
        ...(missing_count !== undefined ? { missingCount: missing_count } : {}),
        ...(turnout_pct !== undefined ? { turnoutPct: turnout_pct } : {}),
      },
    });
    ok(res, row);
  })
);

app.get(
  '/api/map/booths',
  asyncHandler(async (_req, res) => {
    ok(
      res,
      await prisma.booth.findMany({
        orderBy: { partNo: 'asc' },
        select: {
          partNo: true,
          areaName: true,
          coveragePct: true,
          status: true,
          voterCount: true,
          lat: true,
          lng: true,
          agentName: true,
        },
      })
    );
  })
);

app.get(
  '/api/team',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.teamMember.findMany({ orderBy: { id: 'asc' } });
    ok(
      res,
      rows.map((r) => ({
        ...r,
        assigned_parts: r.assignedParts,
        assigned_parts_json: JSON.stringify(r.assignedParts || []),
      }))
    );
  })
);

app.post(
  '/api/team',
  asyncHandler(async (req, res) => {
    const { name, role, zone, assigned_parts, status, phone } = req.body || {};
    if (!name || !role) return fail(res, 400, 'name and role required');
    const row = await prisma.teamMember.create({
      data: {
        name,
        role,
        zone: zone || null,
        assignedParts: Array.isArray(assigned_parts) ? assigned_parts.map(Number) : [],
        status: status || 'Active',
        phone: phone || null,
      },
    });
    ok(res, row);
  })
);

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
    app.listen(PORT, () => {
      console.log(`CivicPulse API http://localhost:${PORT}/api`);
      console.log(`DB ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);
      console.log(`OCR uploads → ${OCR_UPLOAD_DIR}`);
      console.log(`OCR recover → ${OCR_EXTRACT_URL}/api/recover`);
    });
  })
  .catch((err) => {
    console.error('DB connect failed:', err.message);
    process.exit(1);
  });
