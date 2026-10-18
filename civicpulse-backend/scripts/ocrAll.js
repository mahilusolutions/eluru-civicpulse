/**
 * OCR every roll_file that still needs real elector data.
 * Uses Poppler (pdftoppm) + Tesseract CLI.
 *
 * Usage:
 *   npm run ocr:all
 *   node scripts/ocrAll.js --part=1
 *   node scripts/ocrAll.js --limit=5
 */
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { ocrPdfToVoters } = require('../services/ocrRoll');
const { upsertBooth, insertVotersFromRows, writePartJson } = require('../services/parseRoll');

function parseArgs() {
  const out = { part: null, limit: 0, dpi: 180 };
  process.argv.slice(2).forEach((a) => {
    if (a.startsWith('--part=')) out.part = Number(a.split('=')[1]);
    if (a.startsWith('--limit=')) out.limit = Number(a.split('=')[1]);
    if (a.startsWith('--dpi=')) out.dpi = Number(a.split('=')[1]);
  });
  return out;
}

async function processOne(file, dpi) {
  const pdfPath = file.storage_path;
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    throw new Error(`Missing PDF on disk: ${pdfPath}`);
  }

  db.prepare(
    `UPDATE roll_files SET parse_status = 'ocr', error_message = NULL WHERE id = ?`
  ).run(file.id);

  const started = Date.now();
  console.log(`\n▶ Part ${file.part_no} — ${file.filename}`);

  const result = await ocrPdfToVoters(pdfPath, file.part_no, {
    dpi,
    startPage: 3,
    onProgress: (p) => {
      if (p.stage === 'ocr' && (p.page === 1 || p.page % 5 === 0 || p.page === p.total)) {
        process.stdout.write(`  OCR page ${p.page}/${p.total}\r`);
      }
    },
  });

  upsertBooth(file.part_no);
  insertVotersFromRows(file.part_no, result.voters);
  writePartJson(file.part_no, result.voters, {
    parse_status: 'ready',
    page_count: result.pageCount,
    source: 'tesseract-ocr',
  });

  db.prepare(`
    UPDATE roll_files
    SET parse_status = 'ready',
        page_count = ?,
        voter_count = ?,
        error_message = NULL,
        processed_at = datetime('now')
    WHERE id = ?
  `).run(result.pageCount, result.voters.length, file.id);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `  ✓ Part ${file.part_no}: ${result.voters.length} electors from ${result.ocrPages} pages (${secs}s)`
  );
  return result.voters.length;
}

async function main() {
  const args = parseArgs();

  let sql = `
    SELECT * FROM roll_files
    WHERE filename NOT LIKE 'import-part-%'
      AND part_no IS NOT NULL
      AND storage_path IS NOT NULL
  `;
  const params = [];
  if (args.part) {
    sql += ' AND part_no = ?';
    params.push(args.part);
  } else {
    sql += ` AND parse_status IN ('needs_import','failed','queued','ocr')`;
  }
  sql += ' ORDER BY part_no ASC';
  if (args.limit > 0) sql += ` LIMIT ${Number(args.limit)}`;

  const files = db.prepare(sql).all(...params);
  console.log(`OCR queue: ${files.length} PDF(s) · dpi=${args.dpi}`);
  console.log(`Tesseract + Poppler extracting REAL electors (not demo).`);

  let ok = 0;
  let fail = 0;
  let totalVoters = 0;

  for (const file of files) {
    try {
      totalVoters += await processOne(file, args.dpi);
      ok += 1;
    } catch (err) {
      fail += 1;
      console.error(`  ✗ Part ${file.part_no}: ${err.message}`);
      db.prepare(`
        UPDATE roll_files
        SET parse_status = 'failed', error_message = ?, processed_at = datetime('now')
        WHERE id = ?
      `).run(String(err.message).slice(0, 500), file.id);
    }
  }

  const voters = db.prepare('SELECT COUNT(*) AS c FROM voters').get().c;
  console.log(`\nDone. OK=${ok} fail=${fail} voters_in_db=${voters} extracted_this_run=${totalVoters}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
