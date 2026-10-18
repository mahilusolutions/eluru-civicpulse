const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { db, jsonDir } = require('../db');
const { ocrPdfToVoters } = require('./ocrRoll');

function parseFilename(filename) {
  // 2026-EROLLGEN-S01-65-SIR-DraftRoll-Revision1-ENG-12-WI.pdf
  const m = filename.match(/(\d{4}).*?S0?1-?65.*?ENG-(\d+)/i);
  if (m) {
    return { year: Number(m[1]), part_no: Number(m[2]), ac_code: 'S01-65' };
  }
  const partOnly = filename.match(/ENG-(\d+)/i) || filename.match(/part[-_ ]?(\d+)/i);
  return {
    year: 2026,
    part_no: partOnly ? Number(partOnly[1]) : null,
    ac_code: 'S01-65',
  };
}

function parseVoterText(text, partNo) {
  const voters = [];
  if (!text || !text.trim()) return voters;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const epicRe = /([A-Z]{2,3}[\/\-]?\d{1,3}[\/\-]?\d{5,10}|[A-Z]{3}\d{7})/i;
  const ageGenderRe = /(\d{1,3})\s*[\/\-]?\s*([MF])/i;

  let buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    const block = buffer.join(' ');
    const epicMatch = block.match(epicRe);
    const ag = block.match(ageGenderRe);
    const houseMatch = block.match(/(?:House|H\.?\s*No\.?|Door)\s*[:\-]?\s*([0-9A-Za-z\-\/]+)/i);
    const nameMatch = block.match(/(?:Name|Elector)[:\-]?\s*([A-Za-z .]+)/i);
    const relMatch = block.match(/(?:Father|Husband|Mother|Other)[:\-]?\s*(?:Name)?[:\-]?\s*([A-Za-z .]+)/i);

    const name = nameMatch ? nameMatch[1].trim() : buffer[0];
    if (name && name.length > 2) {
      voters.push({
        part_no: partNo,
        serial_no: voters.length + 1,
        epic: epicMatch ? epicMatch[1].toUpperCase() : null,
        name: name.replace(/\s+/g, ' ').slice(0, 120),
        relation_type: /husband/i.test(block)
          ? 'husband'
          : /mother/i.test(block)
            ? 'mother'
            : 'father',
        relation_name: relMatch ? relMatch[1].trim() : null,
        house_no: houseMatch ? houseMatch[1] : null,
        age: ag ? Number(ag[1]) : null,
        gender: ag ? ag[2].toUpperCase() : null,
        status: 'active',
        raw_ocr_text: block.slice(0, 1000),
      });
    }
    buffer = [];
  };

  lines.forEach((line) => {
    buffer.push(line);
    if (epicRe.test(line) || buffer.length >= 6) flush();
  });
  flush();
  return voters;
}

function upsertBooth(partNo, extra = {}) {
  const existing = db.prepare('SELECT part_no FROM booths WHERE part_no = ?').get(partNo);
  if (existing) {
    db.prepare(`
      UPDATE booths SET
        area_name = COALESCE(@area_name, area_name),
        polling_station_name = COALESCE(@polling_station_name, polling_station_name),
        updated_at = datetime('now')
      WHERE part_no = @part_no
    `).run({ part_no: partNo, area_name: extra.area_name || null, polling_station_name: extra.polling_station_name || null });
  } else {
    db.prepare(`
      INSERT INTO booths (part_no, area_name, polling_station_name, status)
      VALUES (?, ?, ?, 'pending')
    `).run(partNo, extra.area_name || `Part ${partNo}`, extra.polling_station_name || `Polling Station Part ${partNo}`);
  }
}

function insertVoters(partNo, voters) {
  const insert = db.prepare(`
    INSERT INTO voters (part_no, serial_no, epic, name, relation_type, relation_name, house_no, age, gender, status, raw_ocr_text, raw_json)
    VALUES (@part_no, @serial_no, @epic, @name, @relation_type, @relation_name, @house_no, @age, @gender, @status, @raw_ocr_text, @raw_json)
  `);

  const wipe = db.prepare('DELETE FROM voters WHERE part_no = ?');
  const tx = db.transaction((rows) => {
    wipe.run(partNo);
    rows.forEach((row, idx) => {
      insert.run({
        part_no: partNo,
        serial_no: row.serial_no || idx + 1,
        epic: row.epic || null,
        name: row.name,
        relation_type: row.relation_type || 'father',
        relation_name: row.relation_name || null,
        house_no: row.house_no || null,
        age: row.age ?? null,
        gender: row.gender || null,
        status: row.status || 'active',
        raw_ocr_text: row.raw_ocr_text || null,
        raw_json: JSON.stringify(row),
      });
    });
    db.prepare(
      "UPDATE booths SET voter_count = (SELECT COUNT(*) FROM voters WHERE part_no = ?), updated_at = datetime('now') WHERE part_no = ?"
    ).run(partNo, partNo);
  });
  tx(voters);
}

function insertVotersFromRows(partNo, voters) {
  insertVoters(partNo, voters || []);
}

function writePartJson(partNo, voters, meta = {}) {
  const out = {
    part_no: partNo,
    ac_code: 'S01-65',
    ac_name: 'Eluru',
    exported_at: new Date().toISOString(),
    ...meta,
    voters,
  };
  fs.writeFileSync(path.join(jsonDir, `part-${partNo}.json`), JSON.stringify(out, null, 2));
}

async function processRollFile(fileId) {
  const file = db.prepare('SELECT * FROM roll_files WHERE id = ?').get(fileId);
  if (!file) return;

  db.prepare(`UPDATE roll_files SET parse_status = 'ocr', error_message = NULL WHERE id = ?`).run(fileId);

  try {
    const buf = fs.readFileSync(file.storage_path);
    let text = '';
    let pageCount = 0;
    try {
      const parsed = await pdfParse(buf);
      text = parsed.text || '';
      pageCount = parsed.numpages || 0;
    } catch (e) {
      text = '';
    }

    const partNo = file.part_no;
    if (!partNo) throw new Error('Could not detect part number from filename');

    upsertBooth(partNo);

    let voters = parseVoterText(text, partNo);
    let usedOcr = false;

    if (!voters.length && file.storage_path && fs.existsSync(file.storage_path)) {
      // Image-scanned ECI roll — extract real electors via Tesseract OCR
      const ocr = await ocrPdfToVoters(file.storage_path, partNo, {
        dpi: 180,
        startPage: 3,
      });
      voters = ocr.voters;
      pageCount = ocr.pageCount || pageCount;
      usedOcr = true;
    }

    if (!voters.length) {
      db.prepare(`
        UPDATE roll_files
        SET parse_status = 'needs_import',
            page_count = ?,
            voter_count = 0,
            error_message = ?,
            processed_at = datetime('now')
        WHERE id = ?
      `).run(
        pageCount,
        'OCR found no electors. Check PDF quality or import CSV for this part.',
        fileId
      );
      writePartJson(partNo, [], { parse_status: 'needs_import', page_count: pageCount });
      return;
    }

    insertVoters(partNo, voters);
    writePartJson(partNo, voters, {
      parse_status: 'ready',
      page_count: pageCount,
      source: usedOcr ? 'tesseract-ocr' : 'pdf-text',
    });

    db.prepare(`
      UPDATE roll_files
      SET parse_status = 'ready', page_count = ?, voter_count = ?, processed_at = datetime('now'), error_message = NULL
      WHERE id = ?
    `).run(pageCount, voters.length, fileId);
  } catch (err) {
    db.prepare(`
      UPDATE roll_files
      SET parse_status = 'failed', error_message = ?, processed_at = datetime('now')
      WHERE id = ?
    `).run(err.message || 'Parse failed', fileId);
  }
}

function importVotersRows(partNo, rows) {
  upsertBooth(partNo);
  const normalized = rows.map((r, idx) => ({
    part_no: partNo,
    serial_no: Number(r.serial_no || r.serial || idx + 1),
    epic: r.epic || r.voter_id || null,
    name: r.name,
    relation_type: r.relation_type || r.relation || 'father',
    relation_name: r.relation_name || null,
    house_no: r.house_no || r.house || null,
    age: r.age ? Number(r.age) : null,
    gender: r.gender || null,
    status: r.status || 'active',
    raw_ocr_text: null,
  })).filter((r) => r.name);

  insertVoters(partNo, normalized);
  writePartJson(partNo, normalized, { parse_status: 'imported' });

  // Mark any PDF that was waiting on CSV for this part as ready
  db.prepare(`
    UPDATE roll_files
    SET parse_status = 'ready',
        voter_count = ?,
        error_message = NULL,
        processed_at = datetime('now')
    WHERE part_no = ? AND parse_status IN ('needs_import', 'failed', 'queued')
  `).run(normalized.length, partNo);

  const stillNeedsLog = db
    .prepare('SELECT id FROM roll_files WHERE part_no = ? AND filename LIKE ?')
    .get(partNo, `import-part-${partNo}.%`);
  if (!stillNeedsLog) {
    db.prepare(`
      INSERT INTO roll_files (filename, part_no, parse_status, voter_count, processed_at)
      VALUES (?, ?, 'ready', ?, datetime('now'))
    `).run(`import-part-${partNo}.csv`, partNo, normalized.length);
  } else {
    db.prepare(`
      UPDATE roll_files SET voter_count = ?, parse_status = 'ready', processed_at = datetime('now')
      WHERE id = ?
    `).run(normalized.length, stillNeedsLog.id);
  }

  return normalized.length;
}

module.exports = {
  parseFilename,
  processRollFile,
  importVotersRows,
  parseVoterText,
  upsertBooth,
  insertVotersFromRows,
  writePartJson,
};
