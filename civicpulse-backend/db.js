const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const jsonDir = path.join(dataDir, 'json');

[dataDir, uploadsDir, jsonDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const dbPath = path.join(dataDir, 'civicpulse.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS booths (
    part_no INTEGER PRIMARY KEY,
    polling_station_name TEXT,
    polling_station_address TEXT,
    area_name TEXT,
    ac_code TEXT DEFAULT 'S01-65',
    ac_name TEXT DEFAULT 'Eluru',
    agent_name TEXT,
    coordinator_name TEXT,
    coverage_pct REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    lat REAL,
    lng REAL,
    ward_id INTEGER,
    voter_count INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS voters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_no INTEGER NOT NULL,
    serial_no INTEGER,
    epic TEXT,
    name TEXT NOT NULL,
    relation_type TEXT,
    relation_name TEXT,
    house_no TEXT,
    age INTEGER,
    gender TEXT,
    page_no INTEGER,
    box_index INTEGER,
    status TEXT DEFAULT 'active',
    support_lean TEXT,
    phone TEXT,
    raw_ocr_text TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_voters_part ON voters(part_no);
  CREATE INDEX IF NOT EXISTS idx_voters_epic ON voters(epic);
  CREATE INDEX IF NOT EXISTS idx_voters_house ON voters(part_no, house_no);
  CREATE INDEX IF NOT EXISTS idx_voters_name ON voters(name);

  CREATE TABLE IF NOT EXISTS roll_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    part_no INTEGER,
    ac_code TEXT DEFAULT 'S01-65',
    year INTEGER DEFAULT 2026,
    revision INTEGER DEFAULT 1,
    page_count INTEGER DEFAULT 0,
    storage_path TEXT,
    parse_status TEXT DEFAULT 'queued',
    voter_count INTEGER DEFAULT 0,
    error_message TEXT,
    uploaded_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS wards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ward_no INTEGER UNIQUE,
    name TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS ward_booths (
    ward_id INTEGER NOT NULL,
    part_no INTEGER NOT NULL,
    PRIMARY KEY (ward_id, part_no)
  );

  CREATE TABLE IF NOT EXISTS outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voter_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    outcome TEXT,
    notes TEXT,
    created_by_role TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    ward_id INTEGER,
    part_no INTEGER,
    priority TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'Open',
    reporter_role TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_id INTEGER NOT NULL,
    part_no INTEGER,
    answer TEXT NOT NULL,
    respondent_name TEXT,
    created_by_role TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    zone TEXT,
    assigned_parts_json TEXT,
    status TEXT DEFAULT 'Active',
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS election_day_stats (
    part_no INTEGER PRIMARY KEY,
    slip_printed INTEGER DEFAULT 0,
    voted_count INTEGER DEFAULT 0,
    missing_count INTEGER DEFAULT 0,
    turnout_pct REAL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function seedIfEmpty() {
  const boothCount = db.prepare('SELECT COUNT(*) AS c FROM booths').get().c;
  if (boothCount > 0) return;

  const insertBooth = db.prepare(`
    INSERT INTO booths (part_no, area_name, polling_station_name, agent_name, coverage_pct, status, voter_count)
    VALUES (@part_no, @area_name, @polling_station_name, @agent_name, @coverage_pct, @status, @voter_count)
  `);

  const booths = [
    { part_no: 12, area_name: 'Powerpet', polling_station_name: 'Mpl Primary School Powerpet', agent_name: 'R. Naidu', coverage_pct: 92, status: 'active', voter_count: 6 },
    { part_no: 41, area_name: 'Sanivarapupeta', polling_station_name: 'ZPHS Sanivarapupeta', agent_name: 'S. Lakshmi', coverage_pct: 78, status: 'active', voter_count: 4 },
    { part_no: 88, area_name: 'Vatluru', polling_station_name: 'Community Hall Vatluru', agent_name: 'K. Raju', coverage_pct: 64, status: 'pending', voter_count: 3 },
    { part_no: 156, area_name: 'Eluru Urban', polling_station_name: 'Municipal High School', agent_name: 'P. Devi', coverage_pct: 51, status: 'pending', voter_count: 3 },
    { part_no: 203, area_name: 'Denduluru Road', polling_station_name: 'Anganwadi Centre', agent_name: 'M. Babu', coverage_pct: 37, status: 'pending', voter_count: 2 },
  ];
  booths.forEach((b) => insertBooth.run(b));

  const insertVoter = db.prepare(`
    INSERT INTO voters (part_no, serial_no, epic, name, relation_type, relation_name, house_no, age, gender, status)
    VALUES (@part_no, @serial_no, @epic, @name, @relation_type, @relation_name, @house_no, @age, @gender, @status)
  `);

  const voters = [
    { part_no: 12, serial_no: 1, epic: 'AP/65/0123456', name: 'Venkata Rama Rao', relation_type: 'father', relation_name: 'Surya Rao', house_no: '4-21', age: 54, gender: 'M', status: 'active' },
    { part_no: 12, serial_no: 2, epic: 'AP/65/0182211', name: 'Lakshmi Devi', relation_type: 'husband', relation_name: 'Venkata Rama Rao', house_no: '4-21', age: 41, gender: 'F', status: 'visited' },
    { part_no: 12, serial_no: 3, epic: 'AP/65/0182212', name: 'Sai Teja', relation_type: 'father', relation_name: 'Venkata Rama Rao', house_no: '4-21', age: 22, gender: 'M', status: 'active' },
    { part_no: 41, serial_no: 1, epic: 'AP/65/0339012', name: 'Suresh Kumar', relation_type: 'father', relation_name: 'Ramaiah', house_no: '2-8', age: 29, gender: 'M', status: 'active' },
    { part_no: 41, serial_no: 2, epic: 'AP/65/0339013', name: 'Anjali', relation_type: 'husband', relation_name: 'Suresh Kumar', house_no: '2-8', age: 26, gender: 'F', status: 'callback' },
    { part_no: 88, serial_no: 1, epic: 'AP/65/0441109', name: 'Padma Priya', relation_type: 'father', relation_name: 'Krishna', house_no: '11-3', age: 36, gender: 'F', status: 'callback' },
    { part_no: 156, serial_no: 1, epic: 'AP/65/0557780', name: 'Anil Reddy', relation_type: 'father', relation_name: 'Venkat Reddy', house_no: '7-14', age: 47, gender: 'M', status: 'active' },
    { part_no: 203, serial_no: 1, epic: 'AP/65/0662204', name: 'Gayatri', relation_type: 'husband', relation_name: 'Ravi', house_no: '1-9', age: 62, gender: 'F', status: 'shifted' },
  ];
  voters.forEach((v) => insertVoter.run(v));

  db.prepare(`INSERT INTO wards (ward_no, name, notes) VALUES (3, 'Ward 3', 'Central Eluru'), (6, 'Ward 6', 'Market side'), (8, 'Ward 8', 'Powerpet link'), (14, 'Ward 14', 'Outer ring')`).run();

  const wardMap = [
    [8, 12],
    [3, 41],
    [6, 88],
    [14, 156],
    [14, 203],
  ];
  const link = db.prepare('INSERT INTO ward_booths (ward_id, part_no) VALUES (?, ?)');
  wardMap.forEach(([wardNo, part]) => {
    const ward = db.prepare('SELECT id FROM wards WHERE ward_no = ?').get(wardNo);
    if (ward) link.run(ward.id, part);
  });

  db.prepare(`
    INSERT INTO issues (title, description, ward_id, part_no, priority, status, reporter_role)
    VALUES
      ('Drainage overflow near market', 'Water stagnant after rains', 3, 88, 'High', 'Open', 'booth_agent'),
      ('Streetlight outage — 2nd cross', 'Dark stretch at night', 1, 41, 'Medium', 'In progress', 'volunteer'),
      ('Water supply delay (evening)', 'Low pressure 6–9 PM', 4, 156, 'High', 'Open', 'coordinator'),
      ('Garbage pickup missed 3 days', 'Bins overflowing', 2, 12, 'Medium', 'Resolved', 'volunteer')
  `).run();

  db.prepare(`
    INSERT INTO team_members (name, role, zone, assigned_parts_json, status)
    VALUES
      ('Campaign HQ', 'Admin', 'City-wide', '[]', 'Online'),
      ('Zone East Lead', 'Coordinator', 'Parts 1–80', '[12,41]', 'Online'),
      ('R. Naidu', 'Booth Agent', 'Part 12', '[12]', 'Field'),
      ('Volunteer Cell A', 'Volunteer', 'Powerpet', '[12]', 'Active')
  `).run();

  db.prepare(`
    INSERT INTO surveys (title, question) VALUES
      ('Issue priority pulse', 'What is the top civic issue in your booth area?'),
      ('Candidate awareness', 'Have you heard the Mayor campaign message this week?')
  `).run();

  booths.forEach((b) => {
    db.prepare(`
      INSERT INTO election_day_stats (part_no, slip_printed, voted_count, missing_count, turnout_pct)
      VALUES (?, 0, 0, 0, 0)
    `).run(b.part_no);
  });

  db.prepare(`INSERT INTO settings (key, value) VALUES ('workspace', ?)`).run(
    JSON.stringify({ city: 'Eluru', ac_code: 'S01-65', product: 'CivicPulse' })
  );
}

seedIfEmpty();

module.exports = { db, dataDir, uploadsDir, jsonDir, dbPath };
