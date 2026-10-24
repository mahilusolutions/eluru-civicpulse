/**
 * Everything a roll PDF says about its booth, kept on the booth's own row (public.booths):
 *  - the six pictures of the pictures page (maps, building photos, plans), in the media_* columns
 *  - the cover page details (roll year, dates, town, police station, polling station, voter counts ...) in plain columns
 * A background worker fills them in for each booth right after its voters have been read.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { findPdftoppm } = require('./poppler');

const execFileAsync = promisify(execFile);

const KINDS = [
  { kind: 'nazri_naksha', label: 'Nazri Naksha', col: 0, row: 0 },
  { kind: 'google_map', label: 'Google Map View', col: 1, row: 0 },
  { kind: 'building_front', label: 'Polling Station Building Front View', col: 0, row: 1 },
  { kind: 'station_front', label: 'Polling Station Front View', col: 1, row: 1 },
  { kind: 'cad_view', label: 'Cad View', col: 0, row: 2 },
  { kind: 'key_map', label: 'Key Map View', col: 1, row: 2 },
];
const mediaColumn = (kind) => `media_${kind}`;

const INFO_COLUMNS = [
  ['roll_year', 'int'],
  ['qualifying_date', 'text'],
  ['publication_date', 'text'],
  ['roll_type', 'text'],
  ['main_town', 'text'],
  ['post_office', 'text'],
  ['police_station', 'text'],
  ['mandal', 'text'],
  ['revenue_division', 'text'],
  ['district', 'text'],
  ['pin_code', 'text'],
  ['areas', 'text'],
  ['station_type', 'text'],
  ['auxiliary_stations', 'int'],
  ['roll_serial_start', 'int'],
  ['roll_serial_end', 'int'],
  ['roll_male', 'int'],
  ['roll_female', 'int'],
  ['roll_third', 'int'],
  ['roll_total', 'int'],
  ['info_read_at', 'timestamptz'],
];

async function ensureBoothMediaTable(prisma) {
  for (const k of KINDS) await prisma.$executeRawUnsafe(`ALTER TABLE public.booths ADD COLUMN IF NOT EXISTS ${mediaColumn(k.kind)} bytea`);
  await prisma.$executeRawUnsafe('ALTER TABLE public.booths ADD COLUMN IF NOT EXISTS media_updated_at timestamptz');
  for (const [name, type] of INFO_COLUMNS) await prisma.$executeRawUnsafe(`ALTER TABLE public.booths ADD COLUMN IF NOT EXISTS ${name} ${type}`);

  // Pictures saved earlier in the separate booth_media table move onto the booth row (once).
  const [old] = await prisma.$queryRaw`SELECT to_regclass('public.booth_media')::text AS t`;
  if (old?.t) {
    for (const k of KINDS) {
      await prisma.$executeRawUnsafe(
        `UPDATE public.booths b SET ${mediaColumn(k.kind)} = m.data, media_updated_at = COALESCE(b.media_updated_at, m.created_at)
         FROM public.booth_media m WHERE m.part_no = b.part_no AND m.kind = $1 AND b.${mediaColumn(k.kind)} IS NULL AND length(m.data) >= 4000`,
        k.kind
      );
    }
  }
}

// Cell boxes as fractions of the page width/height (measured on the ECI roll layout, pictures page).
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
 * Cuts the six pictures and saves them on the booth row. They are normally on page 2, but a booth with many roads spills
 * its cover onto page 2 and the pictures move to page 3 (or 4), so each page is tried and the one with the most real
 * pictures wins. Returns how many were saved.
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
          if (info.width >= 60 && info.height >= 60 && data.length >= REAL_PICTURE_BYTES) found.push({ k, data });
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
  for (const { k, data } of best) {
    await prisma.$executeRawUnsafe(`UPDATE public.booths SET ${mediaColumn(k.kind)} = $1 WHERE part_no = $2`, data, partNo);
  }
  await prisma.$executeRaw`UPDATE public.booths SET media_updated_at = now() WHERE part_no = ${partNo}`;
  return best.length;
}

// Drops the box-border noise tesseract reads at the end of a line ("BO", "29D") and stray quotes.
const tidy = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[“”"|]/g, '').replace(/(\s+[\x00-\x7f]{1,3})+\s*$/, '').trim())
    .filter(Boolean);

const isTelugu = (t) => t && (t.match(/[\u0C00-\u0C7F]/g) || []).length >= t.replace(/[\s,.\-\u200c\u200d]/g, '').length * 0.7;
const SEP = /[:：;\u0C03]/;
const afterColon = (l) => String(l).replace(/^.*?[:：;\u0C03]\s*/, '').trim();

/**
 * Reads the cover page (page 1) of a Telugu roll: roll details, area details, polling station, and the voter counts table.
 * The page grows or shrinks with the number of roads listed in section 2, so every row is found from the table's own
 * horizontal lines. Anything that cannot be read with confidence stays null (a gap is better than a wrong value).
 */
async function readTeluguCover(pdf) {
  const sharp = require('sharp');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'boothinfo-'));
  const out = {};
  try {
    const page = await renderPage(pdf, 1, 200, path.join(work, 'p'));
    const { width: W, height: H } = await sharp(page).metadata();
    const telArgs = fs.existsSync(path.join(TESSDATA_DIR, 'tel.traineddata')) ? ['--tessdata-dir', TESSDATA_DIR, '-l', 'tel+eng'] : ['-l', 'tel+eng'];
    const engArgs = fs.existsSync(path.join(TESSDATA_DIR, 'eng.traineddata')) ? ['--tessdata-dir', TESSDATA_DIR, '-l', 'eng'] : ['-l', 'eng'];
    let n = 0;
    const read = async (x0, x1, y0, y1, { digits = false } = {}) => {
      n += 1;
      const file = path.join(work, `r${n}.png`);
      const top = Math.max(0, Math.round(y0 * H));
      await sharp(page).extract({ left: Math.round(x0 * W), top, width: Math.round((x1 - x0) * W), height: Math.min(Math.round((y1 - y0) * H), H - top) }).toFile(file);
      const args = digits ? [file, 'stdout', ...engArgs, '--psm', '6', '-c', 'tessedit_char_whitelist=0123456789'] : [file, 'stdout', ...telArgs, '--psm', '6'];
      const { stdout } = await niceRun(TESSERACT, args, { timeout: 120000, env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
      return stdout;
    };

    const { data, info } = await sharp(page).greyscale().raw().toBuffer({ resolveWithObject: true });
    const lines = [];
    for (let y = 0; y < H; y += 1) {
      let dark = 0;
      for (let x = Math.round(0.03 * W); x < Math.round(0.55 * W); x += 1) if (data[y * info.width + x] < 110) dark += 1;
      if (dark / (0.52 * W) > 0.9 && (!lines.length || y / H - lines[lines.length - 1] > 0.008)) lines.push(y / H);
    }
    if (lines.length < 9 || lines[8] - lines[7] < 0.08) return out;

    // 1. Roll details (left column of section 1): year, qualifying date, type of roll, publication date
    const s1 = tidy(await read(0.02, 0.44, lines[3] + 0.004, lines[4] - 0.004));
    const dates = s1.join(' ').match(/\b\d{2}-\d{2}-\d{4}\b/g) || [];
    out.qualifying_date = dates[0] || null;
    out.publication_date = dates[1] || null;
    const yearMatch = (s1[0] || '').match(/\b(20\d\d)\b/);
    out.roll_year = yearMatch ? Number(yearMatch[1]) : null;
    const typeLine = s1.find((l, i) => i >= 1 && !/\d{2}-\d{2}-\d{4}/.test(l) && afterColon(l).split(/\s+/).length >= 3);
    const type = typeLine ? afterColon(typeLine).replace(/\s*\d{4}$/, (y) => y) : '';
    out.roll_type = type && (type.match(/[\u0C00-\u0C7F]/g) || []).length >= 6 ? type : null;

    // 2. Areas (left) and the village / town table (right)
    const areaLines = (await read(0.02, 0.4, lines[5] + 0.012, lines[6] - 0.008)).split(/\r?\n/).map((l) => l.replace(/[|]/g, '').trim()).filter((l) => /^\S{1,3}\s*[-–]\s*\S/.test(l) && /[\u0C00-\u0C7F]/.test(l));
    out.areas = areaLines.length ? areaLines.join('\n') : null;
    const right = await read(0.42, 0.98, lines[5] + 0.012, lines[6] - 0.008);
    const pin = right.match(/\b\d{6}\b/);
    out.pin_code = pin ? pin[0] : null;
    let rows = tidy(right).filter((l) => SEP.test(l));
    if (rows.length !== 7) rows = tidy(right).length === 7 ? tidy(right) : [];
    if (rows.length === 7) {
      const val = (i) => {
        const v = afterColon(rows[i]);
        return v && isTelugu(v) ? v : null;
      };
      [out.main_town, out.post_office, out.police_station, out.mandal, out.revenue_division, out.district] = [0, 1, 2, 3, 4, 5].map(val);
    }

    // 3. Polling station: name, address, kind of station, number of auxiliary stations
    const nameLines = tidy(await read(0.02, 0.48, lines[7] + 0.025, lines[7] + 0.054));
    const nameLine = nameLines.find((l) => /^\d+\s*[-–]/.test(l)) || [...nameLines].sort((a, b) => b.length - a.length)[0] || '';
    // a one- or two-letter scrap at the very end is the table border read as text
    const name = nameLine.replace(/^[|\s]*(?:\d+|\S{1,3})\s*[-–]\s*/, '').replace(/(\S+\s+\S+\s+\S+.*?)\s+\S{1,2}$/, '$1').trim();
    const addrLines = tidy(await read(0.02, 0.55, lines[8] - 0.068, lines[8] - 0.004));
    // the label "Polling station address:" is cut off, whatever came before the word చిరునామా
    const address = addrLines.join(' ').replace(/\s+/g, ' ').replace(/^.*?\u0C1A\u0C3F\u0C30\u0C41\u0C28\u0C3E\u0C2E\u0C3E\s*:?\s*/, '').trim();
    out.name = isTelugu(name) ? name : null;
    out.address = isTelugu(address) ? address : null;
    const s3r = await read(0.5, 0.98, lines[7] + 0.004, lines[8] - 0.004);
    const s3rLines = tidy(s3r);
    const kind = (s3rLines[0] || '').split(/\s+/).pop();
    out.station_type = kind && isTelugu(kind) ? kind : null;
    const auxLine = s3r.split(/\r?\n/).map((l) => l.trim().match(/\s(\d{1,3})\s*$/)).find(Boolean);
    out.auxiliary_stations = auxLine ? Number(auxLine[1]) : null;

    // 4. Voter counts of this roll: first serial, last serial, men, women, third gender, total
    if (lines.length >= 12) {
      const nums = (await read(0.03, 0.98, lines[10] + 0.004, lines[11] + 0.05, { digits: true })).split(/\s+/).filter(Boolean).map(Number);
      if (nums.length === 6 && nums[2] + nums[3] + nums[4] === nums[5]) {
        [out.roll_serial_start, out.roll_serial_end, out.roll_male, out.roll_female, out.roll_third, out.roll_total] = nums;
      }
    }
    return out;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function saveCover(prisma, partNo, c) {
  await prisma.$executeRaw`
    UPDATE public.booths SET
      polling_station_name = COALESCE(${c.name ?? null}, polling_station_name),
      polling_station_address = COALESCE(${c.address ?? null}, polling_station_address),
      roll_year = ${c.roll_year ?? null}, qualifying_date = ${c.qualifying_date ?? null}, publication_date = ${c.publication_date ?? null},
      roll_type = ${c.roll_type ?? null}, main_town = ${c.main_town ?? null}, post_office = ${c.post_office ?? null},
      police_station = ${c.police_station ?? null}, mandal = ${c.mandal ?? null}, revenue_division = ${c.revenue_division ?? null},
      district = ${c.district ?? null}, pin_code = ${c.pin_code ?? null}, areas = ${c.areas ?? null},
      station_type = ${c.station_type ?? null}, auxiliary_stations = ${c.auxiliary_stations ?? null},
      roll_serial_start = ${c.roll_serial_start ?? null}, roll_serial_end = ${c.roll_serial_end ?? null},
      roll_male = ${c.roll_male ?? null}, roll_female = ${c.roll_female ?? null}, roll_third = ${c.roll_third ?? null},
      roll_total = ${c.roll_total ?? null}, info_read_at = now()
    WHERE part_no = ${partNo}`;
}

/**
 * Background filler: for each booth that has been read, saves its six pictures and (Telugu rolls) everything on the cover
 * page. One booth per tick, only while the server is not busy with the OCR.
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
        JOIN public.booths b ON b.part_no = d.part_no
        WHERE r.parse_status::text = 'ready' AND d.part_no IS NOT NULL AND d.part_no <> ALL(${skip}::int[])
          AND (b.media_updated_at IS NULL OR (d.filename ~* '[-_]TEL[-_][0-9]+' AND b.info_read_at IS NULL))
        ORDER BY d.part_no LIMIT 1`;
      if (!doc) return;
      tried.add(doc.part_no);
      const pdf = findRollPdf({ storagePath: doc.storage_path, filename: doc.filename });
      if (!pdf) return log.warn(`booth info: PDF for part ${doc.part_no} not found`);
      const [{ done }] = await prisma.$queryRaw`SELECT (media_updated_at IS NOT NULL) AS done FROM public.booths WHERE part_no = ${doc.part_no}`;
      const pics = done ? 'kept' : await cutBoothPictures({ prisma, partNo: doc.part_no, pdf });
      let read = 0;
      if (isTeluguRoll(doc.filename)) {
        const cover = await readTeluguCover(pdf);
        read = Object.values(cover).filter((v) => v != null).length;
        await saveCover(prisma, doc.part_no, cover);
      }
      log.log(`booth info: part ${doc.part_no} -> pictures ${pics}, ${read} details read`);
    } catch (err) {
      log.error('booth info worker:', err.message);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 30000);
  setInterval(tick, intervalMs).unref?.();
}

module.exports = { KINDS, mediaColumn, ensureBoothMediaTable, cutBoothPictures, readTeluguCover, readTeluguStation: readTeluguCover, startBoothInfoWorker };
