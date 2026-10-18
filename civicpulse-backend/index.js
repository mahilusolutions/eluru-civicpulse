const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, uploadsDir } = require('./db');
const { parseFilename, processRollFile, importVotersRows } = require('./services/parseRoll');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 40 * 1024 * 1024 },
});

function ok(res, data) {
  res.json({ success: true, data });
}

function fail(res, status, message) {
  res.status(status).json({ success: false, message });
}

app.get('/api/health', (_req, res) => {
  ok(res, { status: 'ok', product: 'CivicPulse', city: 'Eluru' });
});

app.get('/api/dashboard/summary', (_req, res) => {
  const booths = db.prepare('SELECT COUNT(*) AS c FROM booths').get().c;
  const voters = db.prepare('SELECT COUNT(*) AS c FROM voters').get().c;
  const coverage = db.prepare('SELECT AVG(coverage_pct) AS a FROM booths').get().a || 0;
  const openIssues = db
    .prepare("SELECT COUNT(*) AS c FROM issues WHERE status != 'Resolved'")
    .get().c;
  const files = db.prepare('SELECT COUNT(*) AS c FROM roll_files').get().c;
  const topBooths = db
    .prepare(
      'SELECT part_no, area_name, agent_name, coverage_pct, voter_count, status FROM booths ORDER BY coverage_pct DESC LIMIT 8'
    )
    .all();
  const recentIssues = db
    .prepare(
      'SELECT id, title, priority, status, part_no, created_at FROM issues ORDER BY id DESC LIMIT 8'
    )
    .all();

  ok(res, {
    stats: [
      { label: 'Booth parts', value: String(booths), hint: 'Eluru AC S01-65' },
      { label: 'Voters indexed', value: String(voters), hint: 'In local SQLite' },
      { label: 'Avg coverage', value: `${Math.round(coverage)}%`, hint: 'Booth outreach' },
      { label: 'Open issues', value: String(openIssues), hint: 'Civic tickets' },
    ],
    files,
    topBooths,
    recentIssues,
  });
});

app.get('/api/voters', (req, res) => {
  const q = (req.query.q || '').trim();
  const part = req.query.part;
  const status = req.query.status;
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  let sql = 'SELECT * FROM voters WHERE 1=1';
  const params = [];
  if (part && part !== 'all') {
    sql += ' AND part_no = ?';
    params.push(Number(part));
  }
  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (q) {
    sql += ' AND (name LIKE ? OR epic LIKE ? OR house_no LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY part_no, serial_no LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) AS c FROM voters').get().c;
  ok(res, { rows, total, count: rows.length });
});

app.get('/api/voters/:id', (req, res) => {
  const voter = db.prepare('SELECT * FROM voters WHERE id = ?').get(req.params.id);
  if (!voter) return fail(res, 404, 'Voter not found');
  const outreach = db
    .prepare('SELECT * FROM outreach WHERE voter_id = ? ORDER BY id DESC')
    .all(voter.id);
  ok(res, { ...voter, outreach });
});

app.patch('/api/voters/:id', (req, res) => {
  const voter = db.prepare('SELECT id FROM voters WHERE id = ?').get(req.params.id);
  if (!voter) return fail(res, 404, 'Voter not found');
  const { status, phone, support_lean } = req.body || {};
  db.prepare(`
    UPDATE voters SET
      status = COALESCE(?, status),
      phone = COALESCE(?, phone),
      support_lean = COALESCE(?, support_lean),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(status || null, phone || null, support_lean || null, req.params.id);
  ok(res, db.prepare('SELECT * FROM voters WHERE id = ?').get(req.params.id));
});

app.get('/api/booths', (_req, res) => {
  const rows = db
    .prepare(
      'SELECT * FROM booths ORDER BY part_no ASC'
    )
    .all();
  ok(res, rows);
});

app.get('/api/booths/:part', (req, res) => {
  const booth = db.prepare('SELECT * FROM booths WHERE part_no = ?').get(req.params.part);
  if (!booth) return fail(res, 404, 'Booth not found');
  const voters = db
    .prepare('SELECT COUNT(*) AS c FROM voters WHERE part_no = ?')
    .get(booth.part_no).c;
  ok(res, { ...booth, voter_count: voters });
});

app.patch('/api/booths/:part', (req, res) => {
  const { agent_name, coverage_pct, status, coordinator_name } = req.body || {};
  db.prepare(`
    UPDATE booths SET
      agent_name = COALESCE(?, agent_name),
      coverage_pct = COALESCE(?, coverage_pct),
      status = COALESCE(?, status),
      coordinator_name = COALESCE(?, coordinator_name),
      updated_at = datetime('now')
    WHERE part_no = ?
  `).run(
    agent_name || null,
    coverage_pct ?? null,
    status || null,
    coordinator_name || null,
    req.params.part
  );
  ok(res, db.prepare('SELECT * FROM booths WHERE part_no = ?').get(req.params.part));
});

app.get('/api/households', (req, res) => {
  const part = req.query.part;
  let sql = `
    SELECT part_no, house_no,
      COUNT(*) AS member_count,
      MIN(name) AS head_name,
      GROUP_CONCAT(id) AS member_ids
    FROM voters
    WHERE house_no IS NOT NULL AND house_no != ''
  `;
  const params = [];
  if (part && part !== 'all') {
    sql += ' AND part_no = ?';
    params.push(Number(part));
  }
  sql += ' GROUP BY part_no, house_no ORDER BY part_no, house_no LIMIT 200';
  ok(res, db.prepare(sql).all(...params));
});

app.get('/api/wards', (_req, res) => {
  const wards = db.prepare('SELECT * FROM wards ORDER BY ward_no').all();
  const withParts = wards.map((w) => ({
    ...w,
    parts: db
      .prepare('SELECT part_no FROM ward_booths WHERE ward_id = ? ORDER BY part_no')
      .all(w.id)
      .map((r) => r.part_no),
  }));
  ok(res, withParts);
});

app.get('/api/outreach', (req, res) => {
  const voterId = req.query.voter_id;
  let rows;
  if (voterId) {
    rows = db
      .prepare(
        `SELECT o.*, v.name AS voter_name, v.part_no
         FROM outreach o JOIN voters v ON v.id = o.voter_id
         WHERE o.voter_id = ? ORDER BY o.id DESC`
      )
      .all(voterId);
  } else {
    rows = db
      .prepare(
        `SELECT o.*, v.name AS voter_name, v.part_no
         FROM outreach o JOIN voters v ON v.id = o.voter_id
         ORDER BY o.id DESC LIMIT 100`
      )
      .all();
  }
  ok(res, rows);
});

app.post('/api/outreach', (req, res) => {
  const { voter_id, type, outcome, notes, created_by_role } = req.body || {};
  if (!voter_id || !type) return fail(res, 400, 'voter_id and type required');
  const info = db
    .prepare(
      `INSERT INTO outreach (voter_id, type, outcome, notes, created_by_role)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(voter_id, type, outcome || null, notes || null, created_by_role || null);
  ok(res, db.prepare('SELECT * FROM outreach WHERE id = ?').get(info.lastInsertRowid));
});

app.get('/api/issues', (_req, res) => {
  ok(res, db.prepare('SELECT * FROM issues ORDER BY id DESC').all());
});

app.post('/api/issues', (req, res) => {
  const { title, description, ward_id, part_no, priority, reporter_role } = req.body || {};
  if (!title) return fail(res, 400, 'title required');
  const info = db
    .prepare(
      `INSERT INTO issues (title, description, ward_id, part_no, priority, reporter_role)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      title,
      description || null,
      ward_id || null,
      part_no || null,
      priority || 'Medium',
      reporter_role || null
    );
  ok(res, db.prepare('SELECT * FROM issues WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/api/issues/:id', (req, res) => {
  const { status, priority } = req.body || {};
  db.prepare(`
    UPDATE issues SET
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(status || null, priority || null, req.params.id);
  ok(res, db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id));
});

app.get('/api/surveys', (_req, res) => {
  const surveys = db.prepare('SELECT * FROM surveys ORDER BY id DESC').all();
  ok(
    res,
    surveys.map((s) => ({
      ...s,
      responses: db
        .prepare('SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY id DESC')
        .all(s.id),
    }))
  );
});

app.post('/api/surveys/:id/responses', (req, res) => {
  const { answer, part_no, respondent_name, created_by_role } = req.body || {};
  if (!answer) return fail(res, 400, 'answer required');
  const info = db
    .prepare(
      `INSERT INTO survey_responses (survey_id, part_no, answer, respondent_name, created_by_role)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      req.params.id,
      part_no || null,
      answer,
      respondent_name || null,
      created_by_role || null
    );
  ok(res, db.prepare('SELECT * FROM survey_responses WHERE id = ?').get(info.lastInsertRowid));
});

app.get('/api/election-day', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, b.area_name, b.agent_name, b.voter_count
       FROM election_day_stats e
       LEFT JOIN booths b ON b.part_no = e.part_no
       ORDER BY e.part_no`
    )
    .all();
  ok(res, rows);
});

app.patch('/api/election-day/:part', (req, res) => {
  const { slip_printed, voted_count, missing_count, turnout_pct } = req.body || {};
  db.prepare(`
    INSERT INTO election_day_stats (part_no, slip_printed, voted_count, missing_count, turnout_pct, updated_at)
    VALUES (?, COALESCE(?,0), COALESCE(?,0), COALESCE(?,0), COALESCE(?,0), datetime('now'))
    ON CONFLICT(part_no) DO UPDATE SET
      slip_printed = COALESCE(excluded.slip_printed, election_day_stats.slip_printed),
      voted_count = COALESCE(excluded.voted_count, election_day_stats.voted_count),
      missing_count = COALESCE(excluded.missing_count, election_day_stats.missing_count),
      turnout_pct = COALESCE(excluded.turnout_pct, election_day_stats.turnout_pct),
      updated_at = datetime('now')
  `).run(
    req.params.part,
    slip_printed ?? null,
    voted_count ?? null,
    missing_count ?? null,
    turnout_pct ?? null
  );
  ok(res, db.prepare('SELECT * FROM election_day_stats WHERE part_no = ?').get(req.params.part));
});

app.get('/api/map/booths', (_req, res) => {
  const rows = db
    .prepare(
      'SELECT part_no, area_name, coverage_pct, status, voter_count, lat, lng, agent_name FROM booths ORDER BY part_no'
    )
    .all();
  ok(res, rows);
});

app.get('/api/team', (_req, res) => {
  ok(res, db.prepare('SELECT * FROM team_members ORDER BY id').all());
});

app.post('/api/team', (req, res) => {
  const { name, role, zone, assigned_parts, status, phone } = req.body || {};
  if (!name || !role) return fail(res, 400, 'name and role required');
  const info = db
    .prepare(
      `INSERT INTO team_members (name, role, zone, assigned_parts_json, status, phone)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      role,
      zone || null,
      JSON.stringify(assigned_parts || []),
      status || 'Active',
      phone || null
    );
  ok(res, db.prepare('SELECT * FROM team_members WHERE id = ?').get(info.lastInsertRowid));
});

app.get('/api/reports/:type', (req, res) => {
  const type = req.params.type;
  let rows = [];
  if (type === 'voters') rows = db.prepare('SELECT * FROM voters ORDER BY part_no, serial_no').all();
  else if (type === 'booths') rows = db.prepare('SELECT * FROM booths ORDER BY part_no').all();
  else if (type === 'issues') rows = db.prepare('SELECT * FROM issues ORDER BY id').all();
  else if (type === 'outreach') {
    rows = db
      .prepare(
        `SELECT o.*, v.name AS voter_name, v.epic, v.part_no FROM outreach o
         JOIN voters v ON v.id = o.voter_id ORDER BY o.id`
      )
      .all();
  } else return fail(res, 404, 'Unknown report type');

  if (!rows.length) return ok(res, { csv: '', count: 0 });
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(','),
    ...rows.map((r) =>
      keys
        .map((k) => {
          const val = r[k] == null ? '' : String(r[k]).replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(',')
    ),
  ].join('\n');
  ok(res, { csv, count: rows.length, type });
});

app.get('/api/data/files', (_req, res) => {
  ok(res, db.prepare('SELECT * FROM roll_files ORDER BY id DESC').all());
});

app.get('/api/data/files/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM roll_files WHERE id = ?').get(req.params.id);
  if (!file) return fail(res, 404, 'File not found');
  ok(res, file);
});

app.post('/api/data/upload', upload.single('file'), (req, res) => {
  if (!req.file) return fail(res, 400, 'PDF file required');
  const meta = parseFilename(req.file.originalname);
  const info = db
    .prepare(
      `INSERT INTO roll_files (filename, part_no, ac_code, year, storage_path, parse_status)
       VALUES (?, ?, ?, ?, ?, 'queued')`
    )
    .run(
      req.file.originalname,
      meta.part_no,
      meta.ac_code,
      meta.year,
      req.file.path
    );

  const id = info.lastInsertRowid;
  setImmediate(() => processRollFile(id));
  ok(res, db.prepare('SELECT * FROM roll_files WHERE id = ?').get(id));
});

app.post('/api/data/files/:id/retry', (req, res) => {
  const file = db.prepare('SELECT * FROM roll_files WHERE id = ?').get(req.params.id);
  if (!file) return fail(res, 404, 'File not found');
  db.prepare(`UPDATE roll_files SET parse_status = 'queued', error_message = NULL WHERE id = ?`).run(
    file.id
  );
  setImmediate(() => processRollFile(file.id));
  ok(res, db.prepare('SELECT * FROM roll_files WHERE id = ?').get(file.id));
});

app.post('/api/data/import', (req, res) => {
  const { part_no, voters } = req.body || {};
  if (!part_no || !Array.isArray(voters) || !voters.length) {
    return fail(res, 400, 'part_no and voters[] required');
  }
  const count = importVotersRows(Number(part_no), voters);
  ok(res, { part_no: Number(part_no), imported: count });
});

app.get('/api/settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  rows.forEach((r) => {
    try {
      map[r.key] = JSON.parse(r.value);
    } catch {
      map[r.key] = r.value;
    }
  });
  ok(res, map);
});

app.patch('/api/settings/:key', (req, res) => {
  const value = JSON.stringify(req.body?.value ?? req.body ?? {});
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(req.params.key, value);
  ok(res, { key: req.params.key, value: JSON.parse(value) });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  fail(res, 500, err.message || 'Server error');
});

app.listen(PORT, () => {
  console.log(`CivicPulse API running at http://localhost:${PORT}/api`);
  console.log(`SQLite: ${path.join(__dirname, 'data', 'civicpulse.sqlite')}`);
});
