/**
 * Voter photos. Telugu rolls print a photo on every card; the English rolls only say "Photo Available".
 *
 * The photos are cut out of the roll PDF ONCE and kept in the database (voterdb.elector_photos), so showing one is
 * only a database read. A background worker does the cutting, one booth page at a time, and only while the server
 * has spare processor time (the OCR gets priority).
 */
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { findPdftoppm } = require('./poppler');

const execFileAsync = promisify(execFile);

// Where the 3 x 10 cards sit on a roll page, as fractions of the page.
const CARD_COL_LEFT = [0.0248, 0.3447, 0.6638];
const CARD_ROW_TOP = [0.034, 0.1285, 0.2225, 0.317, 0.411, 0.505, 0.5995, 0.6935, 0.7875, 0.882];

const isTeluguRoll = (filename) => /[-_]TEL[-_]\d+/i.test(String(filename || ''));

async function ensurePhotoTables(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS voterdb.elector_photos (
      elector_id bigint PRIMARY KEY REFERENCES voterdb.electors(id) ON DELETE CASCADE,
      mime       text NOT NULL DEFAULT 'image/jpeg',
      data       bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS voterdb.photo_runs (
      document_id bigint PRIMARY KEY REFERENCES voterdb.extracted_documents(id) ON DELETE CASCADE,
      photos      int NOT NULL DEFAULT 0,
      done_at     timestamptz NOT NULL DEFAULT now()
    )`);
}

/**
 * Cuts the photos of one roll page and saves them. Returns how many were saved.
 * Only cards that exist as voters get a photo, and an empty frame (text only) is skipped.
 */
async function cutPagePhotos({ prisma, pdfPath, documentId, pageNo }) {
  const sharp = require('sharp');
  const voters = await prisma.$queryRaw`SELECT id, serial_no FROM voterdb.electors WHERE document_id = ${documentId} AND page_no = ${pageNo}`;
  if (!voters.length) return 0;
  const bySerial = new Map(voters.map((v) => [Number(v.serial_no), v.id]));
  const firstSerial = Math.min(...bySerial.keys());

  const tmp = path.join(os.tmpdir(), `civicpulse-photos-${process.pid}-${documentId}-${pageNo}`);
  const run = ['-n', '19', findPdftoppm(), '-png', '-r', '200', '-f', String(pageNo), '-l', String(pageNo), '-singlefile', pdfPath, tmp];
  // lowest priority where `nice` exists, so cutting never slows the OCR or the website
  if (process.platform === 'win32') await execFileAsync(run[2], run.slice(3), { windowsHide: true, timeout: 120000 });
  else await execFileAsync('nice', run, { timeout: 120000 });

  const png = `${tmp}.png`;
  let saved = 0;
  try {
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
    for (let slot = 0; slot < 30; slot += 1) {
      const electorId = bySerial.get(firstSerial + slot);
      if (electorId == null) continue;
      const cardX = (CARD_COL_LEFT[slot % 3] - 0.004) * info.width;
      const cardY = (CARD_ROW_TOP[Math.floor(slot / 3)] - 0.003) * info.height;
      const cardW = 0.318 * info.width;
      const cardH = 0.096 * info.height;
      const left = Math.max(0, Math.round(cardX + cardW * 0.752)); // the photo frame sits at the right of the card
      const top = Math.max(0, Math.round(cardY + cardH * 0.215));
      const width = Math.min(Math.round(cardW * 0.213), info.width - left);
      const height = Math.min(Math.round(cardH * 0.575), info.height - top);
      if (width < 20 || height < 20) continue;
      const crop = await sharp(data, raw).extract({ left, top, width, height }).jpeg({ quality: 82 }).toBuffer();
      const stats = await sharp(crop).stats();
      const spread = stats.channels.reduce((sum, c) => sum + c.stdev, 0) / stats.channels.length;
      if (spread < 22) continue; // an empty frame is almost one flat colour; a real photo is not
      await prisma.$executeRaw`
        INSERT INTO voterdb.elector_photos (elector_id, mime, data) VALUES (${electorId}, 'image/jpeg', ${crop})
        ON CONFLICT (elector_id) DO UPDATE SET data = EXCLUDED.data, mime = EXCLUDED.mime, created_at = now()`;
      saved += 1;
    }
  } finally {
    try {
      require('fs').rmSync(png, { force: true });
    } catch {
      /* nothing to clean */
    }
  }
  return saved;
}

// One page at a time, and never the same page twice at once.
const chain = { last: Promise.resolve() };
const inFlight = new Map();
function cutPageQueued(args) {
  const key = `${args.documentId}:${args.pageNo}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const job = chain.last.then(() => cutPagePhotos(args));
  chain.last = job.catch(() => {});
  const tracked = job.finally(() => inFlight.delete(key));
  inFlight.set(key, tracked);
  return tracked;
}

/** Background filler: finds a Telugu booth that has been read but has no photos yet, and cuts all its pages. */
function startPhotoWorker({ prisma, findRollPdf, intervalMs = 20000, log = console }) {
  if (process.env.PHOTO_WORKER === '0') return;
  let busy = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Leave the processors to the OCR when it is working hard.
      if (os.loadavg()[0] > os.cpus().length * 3) return;
      const [doc] = await prisma.$queryRaw`
        SELECT d.id, d.filename, d.storage_path
        FROM voterdb.extracted_documents d
        JOIN voterdb.roll_files r ON r.document_id = d.id
        WHERE r.parse_status::text = 'ready'
          AND d.filename ~* '[-_]TEL[-_][0-9]+'
          AND NOT EXISTS (SELECT 1 FROM voterdb.photo_runs pr WHERE pr.document_id = d.id)
        ORDER BY d.id LIMIT 1`;
      if (!doc) return;
      const pdfPath = findRollPdf({ storagePath: doc.storage_path, filename: doc.filename });
      let photos = 0;
      if (pdfPath) {
        const pages = await prisma.$queryRaw`SELECT DISTINCT page_no FROM voterdb.electors WHERE document_id = ${doc.id} AND page_no IS NOT NULL ORDER BY page_no`;
        for (const p of pages) {
          photos += await cutPageQueued({ prisma, pdfPath, documentId: doc.id, pageNo: p.page_no });
          await sleep(150);
        }
      }
      await prisma.$executeRaw`
        INSERT INTO voterdb.photo_runs (document_id, photos) VALUES (${doc.id}, ${photos})
        ON CONFLICT (document_id) DO UPDATE SET photos = EXCLUDED.photos, done_at = now()`;
      log.log(`photos: ${doc.filename} -> ${photos} saved`);
    } catch (err) {
      log.error('photo worker:', err.message);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 15000);
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
}

module.exports = { ensurePhotoTables, cutPagePhotos, cutPageQueued, startPhotoWorker, isTeluguRoll };
