/**
 * Bulk-register every PDF in voter_data_eluru into CivicPulse SQLite.
 * ECI rolls are image-scanned → status needs_import (no text layer).
 * Creates booths 1–247 + roll_files; does not invent elector names.
 *
 * Usage: npm run ingest:pdfs
 */
const fs = require('fs');
const path = require('path');
const { db, jsonDir } = require('../db');
const { parseFilename } = require('../services/parseRoll');

// Sibling folder: Eluru_Mayor/voter_data_eluru
const SRC = path.resolve(__dirname, '../../voter_data_eluru');

function upsertBooth(partNo) {
  const existing = db.prepare('SELECT part_no FROM booths WHERE part_no = ?').get(partNo);
  if (existing) {
    db.prepare(`
      UPDATE booths SET
        area_name = COALESCE(area_name, ?),
        polling_station_name = COALESCE(polling_station_name, ?),
        updated_at = datetime('now')
      WHERE part_no = ?
    `).run(`Part ${partNo}`, `Polling Station Part ${partNo}`, partNo);
    return;
  }
  db.prepare(`
    INSERT INTO booths (part_no, area_name, polling_station_name, status, coverage_pct, voter_count)
    VALUES (?, ?, ?, 'pending', 0, 0)
  `).run(partNo, `Part ${partNo}`, `Polling Station Part ${partNo}`);
}

function ensureElectionDay(partNo) {
  db.prepare(`
    INSERT INTO election_day_stats (part_no, slip_printed, voted_count, missing_count, turnout_pct)
    VALUES (?, 0, 0, 0, 0)
    ON CONFLICT(part_no) DO NOTHING
  `).run(partNo);
}

function writeStubJson(partNo, filename) {
  const out = {
    part_no: partNo,
    ac_code: 'S01-65',
    ac_name: 'Eluru',
    source_pdf: filename,
    parse_status: 'needs_import',
    exported_at: new Date().toISOString(),
    voters: [],
  };
  fs.writeFileSync(path.join(jsonDir, `part-${partNo}.json`), JSON.stringify(out, null, 2));
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Folder not found:', SRC);
    process.exit(1);
  }

  const all = fs
    .readdirSync(SRC)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Prefer non-Copy files when both exist for same part
  const byPart = new Map();
  for (const filename of all) {
    const meta = parseFilename(filename);
    if (!meta.part_no) {
      console.warn('Skip (no part):', filename);
      continue;
    }
    const isCopy = /copy/i.test(filename);
    const prev = byPart.get(meta.part_no);
    if (!prev || (prev.isCopy && !isCopy)) {
      byPart.set(meta.part_no, { filename, isCopy, ...meta });
    }
  }

  console.log(`Found ${all.length} PDFs → ${byPart.size} unique parts`);
  console.log('Source:', SRC);

  const insertFile = db.prepare(`
    INSERT INTO roll_files (filename, part_no, ac_code, year, storage_path, parse_status, voter_count, error_message, processed_at)
    VALUES (?, ?, 'S01-65', 2026, ?, 'needs_import', 0, ?, datetime('now'))
  `);

  const findExisting = db.prepare(
    'SELECT id FROM roll_files WHERE part_no = ? AND filename = ?'
  );

  const updateExisting = db.prepare(`
    UPDATE roll_files SET
      storage_path = ?,
      parse_status = 'needs_import',
      error_message = ?,
      processed_at = datetime('now')
    WHERE id = ?
  `);

  const note =
    'Bulk ingest: image-scanned ECI PDF (no text layer). Import CSV for this part to load electors.';

  const tx = db.transaction((entries) => {
    let inserted = 0;
    let updated = 0;
    for (const entry of entries) {
      const full = path.join(SRC, entry.filename);
      upsertBooth(entry.part_no);
      ensureElectionDay(entry.part_no);
      writeStubJson(entry.part_no, entry.filename);

      const existing = findExisting.get(entry.part_no, entry.filename);
      if (existing) {
        updateExisting.run(full, note, existing.id);
        updated += 1;
      } else {
        // Also skip if another file already registered for this part with same path pattern
        const anyPart = db
          .prepare(
            "SELECT id FROM roll_files WHERE part_no = ? AND filename NOT LIKE 'import-part-%' LIMIT 1"
          )
          .get(entry.part_no);
        if (anyPart) {
          updateExisting.run(full, note, anyPart.id);
          db.prepare('UPDATE roll_files SET filename = ? WHERE id = ?').run(
            entry.filename,
            anyPart.id
          );
          updated += 1;
        } else {
          insertFile.run(entry.filename, entry.part_no, full, note);
          inserted += 1;
        }
      }
    }
    return { inserted, updated };
  });

  const entries = Array.from(byPart.values()).sort((a, b) => a.part_no - b.part_no);
  const result = tx(entries);

  const booths = db.prepare('SELECT COUNT(*) AS c FROM booths').get().c;
  const files = db.prepare('SELECT COUNT(*) AS c FROM roll_files').get().c;
  const voters = db.prepare('SELECT COUNT(*) AS c FROM voters').get().c;

  console.log('Done.');
  console.log(`  roll_files inserted: ${result.inserted}, updated: ${result.updated}`);
  console.log(`  booths total: ${booths}`);
  console.log(`  roll_files total: ${files}`);
  console.log(`  voters total: ${voters} (image PDFs need CSV to add names)`);
  console.log('Refresh Data / Booths / Map in the app.');
}

main();
