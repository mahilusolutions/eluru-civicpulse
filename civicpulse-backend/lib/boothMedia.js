/** Booth pictures (maps, building photos, plans) cut out of page 2 of each roll PDF and kept in the database. */
const KINDS = [
  { kind: 'nazri_naksha', label: 'Nazri Naksha', col: 0, row: 0 },
  { kind: 'google_map', label: 'Google Map View', col: 1, row: 0 },
  { kind: 'building_front', label: 'Polling Station Building Front View', col: 0, row: 1 },
  { kind: 'station_front', label: 'Polling Station Front View', col: 1, row: 1 },
  { kind: 'cad_view', label: 'Cad View', col: 0, row: 2 },
  { kind: 'key_map', label: 'Key Map View', col: 1, row: 2 },
];

async function ensureBoothMediaTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.booth_media (
      part_no    int NOT NULL,
      kind       text NOT NULL,
      label      text NOT NULL,
      mime       text NOT NULL DEFAULT 'image/jpeg',
      width      int,
      height     int,
      data       bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (part_no, kind)
    )`);
}

module.exports = { KINDS, ensureBoothMediaTable };

// ---------------------------------------------------------------------------------------------------------------
// Cutting the pictures and reading the station name/address, for one booth. Used by the background worker below and
// by scripts/extractBoothMedia.js.
// ---------------------------------------------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { findPdftoppm } = require('./poppler');

const execFileAsync = promisify(execFile);
// Cell boxes as fractions of the page width/height (measured on the ECI roll layout, page 2).
const COLS = [
  [0.105, 0.416],
  [0.585, 0.895],
];
const ROWS = [
  [0.0715, 0.2495], // under "Nazri Naksha" / "Google Map View"
  [0.2985, 0.4785],
  [0.5375, 0.7175],
];

const TESSERACT =
  process.env.TESSERACT_PATH ||
  (fs.existsSync('C:\\Program Files\\Tesseract-OCR\\tesseract.exe') ? 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe' : 'tesseract');
const TESSDATA_DIR = process.env.TESSDATA_DIR || path.join(__dirname, '..', '..', 'eluru_voters_data_ocr_extraction', 'tessdata');

// lowest priority where `nice` exists, so this never slows the OCR or the website
const niceRun = (cmd, args, opts) =>
  process.platform === 'win32' ? execFileAsync(cmd, args, { windowsHide: true, ...opts }) : execFileAsync('nice', ['-n', '19', cmd, ...args], opts);

async function renderPage(pdf, pageNo, dpi, prefix) {
  await niceRun(findPdftoppm(), ['-png', '-r', String(dpi), '-f', String(pageNo), '-l', String(pageNo), '-singlefile', pdf, prefix], { timeout: 120000 });
  return `${prefix}.png`;
}

// A real picture is tens of KB as a JPEG; a cut-out of blank paper is about 1.5 KB.
const REAL_PICTURE_BYTES = 4000;

/**
 * Cuts the six pictures and saves them. They are normally on page 2, but a booth with many roads spills its cover onto
 * page 2 and the pictures move to page 3 (or 4), so each page is tried and the one with the most real pictures wins.
 * Returns how many were saved.
 */
async function cutBoothPictures({ prisma, partNo, pdf }) {
  const sharp = require('sharp');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'boothmedia-'));
  let best = [];
  try {
    for (const pageNo of [2, 3, 4]) {
      let page;
      try {
        page = await renderPage(pdf, pageNo, 200, path.join(work, `p${pageNo}`));
      } catch {
        break; // the roll has no such page
      }
      const { width: W, height: H } = await sharp(page).metadata();
      const found = [];
      for (const k of KINDS) {
        const left = Math.round(COLS[k.col][0] * W);
        const top = Math.round(ROWS[k.row][0] * H);
        const width = Math.round((COLS[k.col][1] - COLS[k.col][0]) * W);
        const height = Math.round((ROWS[k.row][1] - ROWS[k.row][0]) * H);
        try {
          const cell = await sharp(page).extract({ left, top, width, height }).flatten({ background: '#ffffff' }).toBuffer();
          // Cut away the near-white margin so only the picture is kept.
          const { data, info } = await sharp(cell).trim({ background: '#ffffff', threshold: 14 }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
          if (info.width >= 60 && info.height >= 60 && data.length >= REAL_PICTURE_BYTES) found.push({ k, data, info });
        } catch (err) {
          console.warn(`booth ${partNo} ${k.kind}: ${err.message}`);
        }
      }
      if (found.length > best.length) best = found;
      if (best.length >= 5) break;
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  for (const { k, data, info } of best) {
    await prisma.$executeRaw`
      INSERT INTO public.booth_media (part_no, kind, label, mime, width, height, data)
      VALUES (${partNo}, ${k.kind}, ${k.label}, 'image/jpeg', ${info.width}, ${info.height}, ${data})
      ON CONFLICT (part_no, kind) DO UPDATE SET label = EXCLUDED.label, width = EXCLUDED.width, height = EXCLUDED.height, data = EXCLUDED.data, created_at = now()`;
  }
  return best.length;
}

// Drops the box-border noise tesseract reads at the end of a line ("BO", "29D") and stray quotes.
const tidy = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[“”"|]/g, '').replace(/(\s+[\x00-\x7f]{1,3})+\s*$/, '').trim())
    .filter(Boolean);

/** Reads the polling station name and address from page 1 of a Telugu roll (section 3, "Polling station details"). */
async function readTeluguStation(pdf) {
  const sharp = require('sharp');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'boothinfo-'));
  try {
    const page = await renderPage(pdf, 1, 200, path.join(work, 'p'));
    const { width: W, height: H } = await sharp(page).metadata();
    const langArgs = fs.existsSync(path.join(TESSDATA_DIR, 'tel.traineddata')) ? ['--tessdata-dir', TESSDATA_DIR, '-l', 'tel+eng'] : ['-l', 'tel+eng'];
    const read = async (name, y0, y1, frac = 0.55) => {
      const file = path.join(work, `${name}.png`);
      await sharp(page).extract({ left: Math.round(0.02 * W), top: Math.round(y0 * H), width: Math.round(frac * W), height: Math.round((y1 - y0) * H) }).toFile(file);
      const { stdout } = await niceRun(TESSERACT, [file, 'stdout', ...langArgs, '--psm', '6'], { timeout: 120000, env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
      return tidy(stdout);
    };
    // The page grows or shrinks with the number of roads listed in section 2, so the rows are found from the table's
    // own horizontal lines: section 3's heading bar ends at the 8th line, and section 4's heading starts at the 9th.
    const { data, info } = await sharp(page).greyscale().raw().toBuffer({ resolveWithObject: true });
    const lines = [];
    for (let y = 0; y < H; y += 1) {
      let dark = 0;
      for (let x = Math.round(0.03 * W); x < Math.round(0.55 * W); x += 1) if (data[y * info.width + x] < 110) dark += 1;
      if (dark / (0.52 * W) > 0.9 && (!lines.length || y / H - lines[lines.length - 1] > 0.008)) lines.push(y / H);
    }
    const sec3 = lines[7];
    const sec4 = lines[8];
    if (sec3 == null || sec4 == null || sec4 - sec3 < 0.08) return { name: null, address: null };
    const nameLines = await read('name', sec3 + 0.025, sec3 + 0.054, 0.46);
    const addrLines = await read('addr', sec4 - 0.068, sec4 - 0.004);
    const nameLine = nameLines.find((l) => /^\d+\s*[-–]/.test(l)) || [...nameLines].sort((x, y) => y.length - x.length)[0] || '';
    // a one- or two-letter scrap at the very end is the table border read as text
    const name = nameLine.replace(/^[|\s]*(?:\d+|\S{1,3})\s*[-–]\s*/, '').replace(/(\S+\s+\S+\s+\S+.*?)\s+\S{1,2}$/, '$1').trim();
    // the label "Polling station address:" is cut off, whatever came before the word చిరునామా
    const address = addrLines.join(' ').replace(/\s+/g, ' ').replace(/^.*?\u0C1A\u0C3F\u0C30\u0C41\u0C28\u0C3E\u0C2E\u0C3E\s*:?\s*/, '').trim();
    // Only text that is mostly Telugu is kept; anything else is a misread and would be worse than the placeholder.
    const telugu = (t) => t && (t.match(/[ఀ-౿]/g) || []).length >= t.replace(/[\s,.\-]/g, '').length * 0.7;
    return { name: telugu(name) ? name : null, address: telugu(address) ? address : null };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Background filler: for each booth that has been read, saves its six pictures and (Telugu rolls) its polling station
 * name and address read from page 1. One booth per tick, only while the server is not busy with the OCR.
 */
function startBoothInfoWorker({ prisma, findRollPdf, isTeluguRoll, intervalMs = 25000, log = console }) {
  if (process.env.BOOTH_INFO_WORKER === '0') return;
  let busy = false;
  const tried = new Set(); // booths already attempted since this server started, so one bad PDF never blocks the rest
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (os.loadavg()[0] > os.cpus().length * 3) return;
      const skip = [...tried, -1];
      const [doc] = await prisma.$queryRaw`
        SELECT d.id, d.filename, d.storage_path, d.part_no
        FROM voterdb.extracted_documents d
        JOIN voterdb.roll_files r ON r.document_id = d.id
        LEFT JOIN public.booths b ON b.part_no = d.part_no
        WHERE r.parse_status::text = 'ready' AND d.part_no IS NOT NULL AND d.part_no <> ALL(${skip}::int[])
          AND (
            NOT EXISTS (SELECT 1 FROM public.booth_media m WHERE m.part_no = d.part_no)
            OR (d.filename ~* '[-_]TEL[-_][0-9]+' AND (b.polling_station_address IS NULL OR b.polling_station_name LIKE 'Polling Station Part %'))
          )
        ORDER BY d.part_no LIMIT 1`;
      if (!doc) return;
      tried.add(doc.part_no);
      const pdf = findRollPdf({ storagePath: doc.storage_path, filename: doc.filename });
      if (!pdf) return log.warn(`booth info: PDF for part ${doc.part_no} not found`);
      const [{ n }] = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM public.booth_media WHERE part_no = ${doc.part_no}`;
      const pics = n ? n : await cutBoothPictures({ prisma, partNo: doc.part_no, pdf });
      let named = false;
      if (isTeluguRoll(doc.filename)) {
        const st = await readTeluguStation(pdf);
        if (st.name || st.address) {
          await prisma.$executeRaw`
            UPDATE public.booths SET
              polling_station_name = COALESCE(${st.name}, polling_station_name),
              polling_station_address = COALESCE(${st.address}, polling_station_address)
            WHERE part_no = ${doc.part_no}`;
          named = true;
        }
      }
      log.log(`booth info: part ${doc.part_no} -> ${pics} pictures${named ? ', station name and address read' : ''}`);
    } catch (err) {
      log.error('booth info worker:', err.message);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 30000);
  setInterval(tick, intervalMs).unref?.();
}

module.exports.cutBoothPictures = cutBoothPictures;
module.exports.readTeluguStation = readTeluguStation;
module.exports.startBoothInfoWorker = startBoothInfoWorker;
