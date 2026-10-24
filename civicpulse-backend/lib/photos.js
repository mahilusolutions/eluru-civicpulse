/**
 * Voter card images and photos. Telugu rolls print a photo on every card; the English rolls only say "Photo Available".
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

// Images live on the voter row itself: card_image (the printed card), photo (the face photo, Telugu rolls only) and
// photo_done (this voter's page has been cut).
async function ensurePhotoTables(prisma) {
  await prisma.$executeRawUnsafe('ALTER TABLE voterdb.electors ADD COLUMN IF NOT EXISTS photo bytea');
  await prisma.$executeRawUnsafe('ALTER TABLE voterdb.electors ADD COLUMN IF NOT EXISTS card_image bytea');
  await prisma.$executeRawUnsafe('ALTER TABLE voterdb.electors ADD COLUMN IF NOT EXISTS photo_done boolean NOT NULL DEFAULT false');
}

/**
 * Cuts the printed card of every voter on one roll page, and (Telugu rolls) their photos, and saves them on the voter rows.
 * Returns how many photos were saved. Only cards that exist as voters are cut, and an empty photo frame (text only) is skipped.
 */
async function cutPagePhotos({ prisma, pdfPath, documentId, pageNo, withPhotos = true }) {
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
      const cardLeft = Math.max(0, Math.round(cardX));
      const cardTop = Math.max(0, Math.round(cardY));
      const cardCrop = await sharp(data, raw)
        .extract({ left: cardLeft, top: cardTop, width: Math.min(Math.round(cardW), info.width - cardLeft), height: Math.min(Math.round(cardH), info.height - cardTop) })
        .jpeg({ quality: 85 })
        .toBuffer();
      await prisma.$executeRaw`UPDATE voterdb.electors SET card_image = ${cardCrop} WHERE id = ${electorId}`;
      if (!withPhotos) continue;
      const left = Math.max(0, Math.round(cardX + cardW * 0.752)); // the photo frame sits at the right of the card
      const top = Math.max(0, Math.round(cardY + cardH * 0.215));
      const width = Math.min(Math.round(cardW * 0.213), info.width - left);
      const height = Math.min(Math.round(cardH * 0.575), info.height - top);
      if (width < 20 || height < 20) continue;
      const crop = await sharp(data, raw).extract({ left, top, width, height }).jpeg({ quality: 82 }).toBuffer();
      const stats = await sharp(crop).stats();
      const spread = stats.channels.reduce((sum, c) => sum + c.stdev, 0) / stats.channels.length;
      if (spread < 22) continue; // an empty frame is almost one flat colour; a real photo is not
      await prisma.$executeRaw`UPDATE voterdb.electors SET photo = ${crop} WHERE id = ${electorId}`;
      saved += 1;
    }
    await prisma.$executeRaw`UPDATE voterdb.electors SET photo_done = true WHERE document_id = ${documentId} AND page_no = ${pageNo}`;
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

/** Background filler: finds a booth that has been read but whose cards/photos are not saved yet, and cuts all its pages. */
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
          AND EXISTS (SELECT 1 FROM voterdb.electors e WHERE e.document_id = d.id AND NOT e.photo_done)
        ORDER BY d.id LIMIT 1`;
      if (!doc) return;
      const pdfPath = findRollPdf({ storagePath: doc.storage_path, filename: doc.filename });
      let photos = 0;
      if (!pdfPath) {
        // PDF missing on disk: mark as looked at so the worker does not retry it every tick
        await prisma.$executeRaw`UPDATE voterdb.electors SET photo_done = true WHERE document_id = ${doc.id}`;
      } else {
        const pages = await prisma.$queryRaw`SELECT DISTINCT page_no FROM voterdb.electors WHERE document_id = ${doc.id} AND page_no IS NOT NULL AND NOT photo_done ORDER BY page_no`;
        for (const p of pages) {
          photos += await cutPageQueued({ prisma, pdfPath, documentId: doc.id, pageNo: p.page_no, withPhotos: isTeluguRoll(doc.filename) });
          await sleep(150);
        }
      }
      await prisma.$executeRaw`UPDATE voterdb.electors SET photo_done = true WHERE document_id = ${doc.id} AND page_no IS NULL`;
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
