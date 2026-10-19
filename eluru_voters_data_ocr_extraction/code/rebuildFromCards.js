/**
 * Rebuild voters for roll PDFs that are already in the database by reading every voter
 * card directly (serial + Voter ID + details). Use it to fix rolls that were extracted
 * before the card reader existed.
 *
 *   node rebuildFromCards.js                 # all documents
 *   node rebuildFromCards.js <filename.pdf>  # one document
 *   node rebuildFromCards.js --dry           # read and report, change nothing
 *   node rebuildFromCards.js --force         # rebuild even if field work was recorded
 *
 * Reading takes about 10 seconds per page.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { buildVoters, TESSERACT, PDFTOPPM } = require('./ocrWorker');
const { readCardHeaders } = require('./cardReader');
const { getPool, saveExtractionToDb } = require('./saveToDb');

const UPLOAD_DIR = process.env.OCR_UPLOAD_DIR || path.join(__dirname, '..', 'uploaded_files');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const only = args.find((a) => !a.startsWith('--'));
const CONCURRENCY = Number(process.env.OCR_PAGE_WORKERS || 3);

async function mapPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next;
        next += 1;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

async function rebuild(pool, doc) {
  const pdfPath = [doc.storage_path, path.join(UPLOAD_DIR, doc.filename)].find((p) => p && fs.existsSync(p));
  if (!pdfPath) {
    console.log(`  skip: PDF not found for ${doc.filename}`);
    return;
  }

  const pagesRes = await pool.query(
    `SELECT page_no AS page, image, char_count, text
       FROM voterdb.extracted_pages WHERE document_id = $1 ORDER BY page_no`,
    [doc.id]
  );
  const pages = pagesRes.rows;
  const voterPages = pages.filter((p) => /Section\s*No\s*and\s*Name/i.test(p.text || ''));
  console.log(`  ${voterPages.length} voter pages to read…`);

  let done = 0;
  await mapPool(voterPages, CONCURRENCY, async (page) => {
    page.cards = await readCardHeaders({
      pdfPath,
      pageNo: page.page,
      pdftoppm: PDFTOPPM,
      tesseract: TESSERACT,
      bodies: true,
    });
    done += 1;
    process.stdout.write(`\r  read ${done}/${voterPages.length} pages (page ${page.page}: ${page.cards.length} cards)   `);
  });
  process.stdout.write('\n');

  const voters = buildVoters(pages, doc.part_no);
  const cards = voterPages.reduce((n, p) => n + (p.cards?.length || 0), 0);
  const withId = voters.filter((v) => v.epic).length;
  const ids = new Map();
  voters.forEach((v) => v.epic && ids.set(v.epic, (ids.get(v.epic) || 0) + 1));
  const dupIds = [...ids.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  const missing = {
    house: voters.filter((v) => !v.house_no).length,
    age: voters.filter((v) => v.age == null).length,
    gender: voters.filter((v) => !v.gender).length,
    relative: voters.filter((v) => !v.relation_name).length,
  };
  console.log(
    `  cards ${cards} → voters ${voters.length} | with Voter ID ${withId} | duplicate IDs ${dupIds.length} | missing`,
    missing
  );
  if (cards !== voters.length) {
    console.log(`  ${cards - voters.length} card(s) could not be parsed into a voter (serials stay aligned).`);
  }

  if (DRY) return;

  if (!FORCE) {
    const work = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM public.outreach o JOIN voterdb.electors e ON e.id = o.elector_id
            WHERE e.document_id = $1)::int AS contacts,
         (SELECT COUNT(*) FROM voterdb.electors
            WHERE document_id = $1 AND (status <> 'active' OR support_lean <> 'unknown' OR phone IS NOT NULL))::int AS edited`,
      [doc.id]
    );
    const { contacts, edited } = work.rows[0];
    if (contacts || edited) {
      console.log(`  stopped: ${contacts} contact(s) and ${edited} edited voter(s) would be lost. Re-run with --force to overwrite.`);
      return;
    }
  }

  const meta = doc.raw_meta && typeof doc.raw_meta === 'object' ? doc.raw_meta : {};
  const result = await saveExtractionToDb(
    {
      filename: doc.filename,
      part_no: doc.part_no,
      pages: pages.map(({ page, image, char_count, text }) => ({ page, image, char_count, text })),
      full_text: doc.full_text,
      voters,
      roll_info: meta.roll_info,
      page_count: pages.length,
      text_length: doc.text_length,
      dpi: doc.dpi,
      page_workers: doc.page_workers,
      page_images_dir: meta.page_images_dir,
      job_id: doc.job_id,
      duration_ms: doc.duration_ms,
    },
    { storagePath: doc.storage_path || pdfPath }
  );
  console.log('  saved:', result);
}

(async () => {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not set');
  const docs = await pool.query(
    `SELECT id, filename, part_no, full_text, raw_meta, storage_path, dpi, page_workers, job_id,
            duration_ms, text_length
       FROM voterdb.extracted_documents ${only ? 'WHERE filename = $1' : ''} ORDER BY id`,
    only ? [only] : []
  );
  if (!docs.rows.length) console.log('No matching documents.');
  for (const doc of docs.rows) {
    console.log(`${doc.filename} (part ${doc.part_no})`);
    await rebuild(pool, doc);
  }
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
