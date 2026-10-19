/**
 * Reads the header of every voter card on a roll page: the printed serial number
 * and the Voter ID (EPIC). Cards sit on a fixed 3 x 10 grid, so each header is cut
 * out of a high-resolution render, the cut-outs are stacked into one small image,
 * and that image is read in a single OCR call with a letters+digits whitelist.
 *
 * This is far more reliable than finding IDs in the full-page text, because the
 * serial and ID are read together (no order-based guessing) and the crop is large
 * and clean.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const COLS = 3;
const ROWS = 10;
// Grid geometry as fractions of the page (measured on the ECI roll layout).
const COL_LEFT = [0.0248, 0.3447, 0.6638];
const ROW_TOP = [0.034, 0.1285, 0.2225, 0.317, 0.411, 0.505, 0.5995, 0.6935, 0.7875, 0.882];
const PAGE_W = 1413; // reference width the fractions were measured against
const PAGE_H = 2000;
const px = (v) => v / PAGE_W; // reference pixel -> fraction of width
const py = (v) => v / PAGE_H; // reference pixel -> fraction of height

// Crop boxes relative to a card's top-left, in reference pixels.
const EPIC_BOX = { x0: 280, x1: 440, y0: 6, y1: 34 };
const SERIAL_BOX = { x0: 14, x1: 196, y0: 11, y1: 28 };
// Name / relative / house / age block (stops before the photo frame).
const BODY_BOX = { x0: 6, x1: 330, y0: 38, y1: 176 };

const WHITELIST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT_TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B' };
const LETTER_TO_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', A: '4', S: '5', G: '6', T: '7', B: '8' };

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} failed (${code}): ${err.slice(0, 300)}`))
    );
  });
}

/** Minimal binary PGM (P5) reader. */
function readPgm(file) {
  const buf = fs.readFileSync(file);
  let pos = 0;
  const token = () => {
    while (pos < buf.length && /\s/.test(String.fromCharCode(buf[pos]))) pos += 1;
    if (buf[pos] === 0x23) {
      while (pos < buf.length && buf[pos] !== 0x0a) pos += 1;
      return token();
    }
    const start = pos;
    while (pos < buf.length && !/\s/.test(String.fromCharCode(buf[pos]))) pos += 1;
    return buf.toString('latin1', start, pos);
  };
  if (token() !== 'P5') throw new Error('Expected a grayscale page image');
  const width = Number(token());
  const height = Number(token());
  token(); // max value
  pos += 1; // single whitespace after header
  return { width, height, data: buf.subarray(pos) };
}

function writePgm(file, width, height, data) {
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`, 'latin1'), data]));
}

function cropBox(img, left, top, w, h) {
  const out = Buffer.alloc(w * h, 255);
  let dark = 0;
  for (let y = 0; y < h; y += 1) {
    const sy = top + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < w; x += 1) {
      const sx = left + x;
      if (sx < 0 || sx >= img.width) continue;
      const v = img.data[sy * img.width + sx];
      out[y * w + x] = v;
      if (v < 110) dark += 1;
    }
  }
  return { data: out, w, h, dark };
}

/**
 * Voter IDs on this roll are 3 letters + 7 digits (e.g. WIO1399070, CQY3776812).
 * The digits read reliably; the letter prefix is where OCR adds stray characters
 * (WIO -> W1I0). So: trust the last 7 characters as the number, and snap the prefix
 * to the closest prefix we have already seen cleanly on the roll.
 */
const KNOWN_PREFIXES = new Set(['WIO']);
const CANON = { 0: '0', O: '0', Q: '0', D: '0', 1: '1', I: '1', L: '1' };
const canon = (str) => [...str].map((ch) => CANON[ch] || ch).join('');

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function repairEpic(raw, prefixes = KNOWN_PREFIXES) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 9 || s.length > 12) return null;
  if (/^[A-Z]{3}\d{7}$/.test(s)) return s;
  const tail = s.slice(-7).replace(/[A-Z]/g, (ch) => LETTER_TO_DIGIT[ch] || '?');
  if (!/^\d{7}$/.test(tail)) return null;
  const head = s.slice(0, s.length - 7);
  let best = null;
  let bestD = 99;
  for (const prefix of prefixes) {
    const d = editDistance(canon(head), canon(prefix));
    if (d < bestD) {
      bestD = d;
      best = prefix;
    }
  }
  if (best && bestD <= 2) return best + tail;
  if (s.length === 10) {
    const letters = [...head].map((ch) => (/[A-Z]/.test(ch) ? ch : DIGIT_TO_LETTER[ch] || '')).join('');
    if (/^[A-Z]{3}$/.test(letters)) return letters + tail;
  }
  return null;
}

function repairSerial(raw) {
  const s = String(raw || '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9]/g, '');
  const n = Number(s);
  return s && n > 0 && n < 100000 ? n : null;
}

/**
 * @returns {Promise<Array<{slot:number, serial:number|null, epic:string|null, raw:string}>>}
 *   one entry per card found on the page, in reading order.
 */
async function readCardHeaders({ pdfPath, pageNo, pdftoppm, tesseract, dpi = 300, tmpDir, bodies = false }) {
  const work = fs.mkdtempSync(path.join(tmpDir || os.tmpdir(), 'cards-'));
  try {
    const prefix = path.join(work, 'page');
    await run(pdftoppm, ['-r', String(dpi), '-gray', '-f', String(pageNo), '-l', String(pageNo), '-singlefile', pdfPath, prefix]);
    const img = readPgm(`${prefix}.pgm`);

    const rows = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const cardLeft = COL_LEFT[c] * img.width;
        const cardTop = ROW_TOP[r] * img.height;
        const box = (b) => ({
          left: Math.round(cardLeft + px(b.x0) * img.width),
          top: Math.round(cardTop + py(b.y0) * img.height),
          w: Math.round(px(b.x1 - b.x0) * img.width),
          h: Math.round(py(b.y1 - b.y0) * img.height),
        });
        const eb = box(EPIC_BOX);
        const sb = box(SERIAL_BOX);
        const epic = cropBox(img, eb.left, eb.top, eb.w, eb.h);
        const serial = cropBox(img, sb.left, sb.top, sb.w, sb.h);
        // An empty slot (no card on this page) has almost no ink.
        if (epic.dark < 60 && serial.dark < 20) continue;
        const bb = box(BODY_BOX);
        rows.push({ slot: r * COLS + c, serial, epic, body: bodies ? cropBox(img, bb.left, bb.top, bb.w, bb.h) : null });
      }
    }
    if (!rows.length) return [];

    // Stack every [serial | gap | epic] pair into one image, one row per card.
    const gap = 70;
    const pad = 24;
    const rowW = Math.max(...rows.map((r) => r.serial.w)) + gap + Math.max(...rows.map((r) => r.epic.w));
    const cellH = Math.max(...rows.map((r) => Math.max(r.serial.h, r.epic.h))) + pad;
    const W = rowW + pad * 2;
    const H = rows.length * cellH + pad * 2;
    const canvas = Buffer.alloc(W * H, 255);
    const serialW = Math.max(...rows.map((r) => r.serial.w));
    rows.forEach((row, i) => {
      const y0 = pad + i * cellH;
      const blit = (src, x0) => {
        for (let y = 0; y < src.h; y += 1) {
          src.data.copy(canvas, (y0 + y) * W + x0, y * src.w, (y + 1) * src.w);
        }
      };
      blit(row.serial, pad);
      blit(row.epic, pad + serialW + gap);
    });
    const stitched = path.join(work, 'cards.pgm');
    writePgm(stitched, W, H, canvas);

    const text = await run(tesseract, [
      stitched,
      'stdout',
      '--psm',
      '6',
      '--dpi',
      String(dpi),
      '-c',
      `tessedit_char_whitelist=${WHITELIST}`,
    ]);

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // One OCR line per card; if the count drifts, fall back to per-card reads.
    const cards =
      lines.length !== rows.length
        ? await readOneByOne(rows, { work, tesseract, dpi })
        : finishCards(rows.map((row, i) => parseLine(row.slot, lines[i])));
    if (bodies) await attachBodies(cards, rows, { work, tesseract, dpi });
    return cards;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Read the text block of each card (name, relative, house, age, gender). Every card is
 * cut out on its own, so the three columns of the page can no longer run into each other.
 * The serial crop is stacked above each body so the output can be split back into cards.
 */
async function attachBodies(cards, rows, { work, tesseract, dpi }) {
  const pad = 24;
  const gap = 60;
  const W = Math.max(...rows.map((r) => r.body.w), ...rows.map((r) => r.serial.w)) + pad * 2;
  const heights = rows.map((r) => r.serial.h + 14 + r.body.h + gap);
  const H = heights.reduce((a, b) => a + b, 0) + pad * 2;
  const canvas = Buffer.alloc(W * H, 255);
  let y = pad;
  rows.forEach((row, i) => {
    const blit = (src, top) => {
      for (let yy = 0; yy < src.h; yy += 1) {
        src.data.copy(canvas, (top + yy) * W + pad, yy * src.w, (yy + 1) * src.w);
      }
    };
    blit(row.serial, y);
    blit(row.body, y + row.serial.h + 14);
    y += heights[i];
  });
  const file = path.join(work, 'bodies.pgm');
  writePgm(file, W, H, canvas);
  const text = await run(tesseract, [file, 'stdout', '--psm', '6', '--dpi', String(dpi), '-l', 'eng']);

  // A line holding only the serial number starts a new card.
  const chunks = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^[^A-Za-z]*\d{1,4}[^A-Za-z\d]*$/.test(line.trim()) && line.trim()) chunks.push([]);
    else if (chunks.length) chunks[chunks.length - 1].push(line);
  }
  const readAlone = async (i) => {
    const one = path.join(work, `body-${rows[i].slot}.pgm`);
    writePgm(one, rows[i].body.w, rows[i].body.h, rows[i].body.data);
    const t = await run(tesseract, [one, 'stdout', '--psm', '6', '--dpi', String(dpi), '-l', 'eng']);
    cards[i].body_text = t.trim();
  };

  if (chunks.length === rows.length) {
    chunks.forEach((c, i) => {
      cards[i].body_text = c.join('\n').trim();
    });
    // The batched read sometimes drops the last line; re-read those cards on their own.
    for (let i = 0; i < rows.length; i += 1) {
      if (!/Age\s*[:;=]/i.test(cards[i].body_text)) await readAlone(i);
    }
    return;
  }

  // Count drifted: read the cards one at a time (slower, but always aligned).
  for (let i = 0; i < rows.length; i += 1) await readAlone(i);
}

function parseLine(slot, line) {
  const tokens = String(line).split(/\s+/).filter(Boolean);
  // The serial is the leading short token; the Voter ID is the longest remaining token.
  const serial = repairSerial(tokens[0]);
  const rest = tokens.slice(1).sort((a, b) => b.length - a.length);
  const epic = /^[A-Z]{3}\d{7}$/.test(rest[0] || '') ? rest[0] : null;
  return { slot, serial, epic, raw: line, tokens: tokens.slice(1) };
}

/** Learn the prefixes seen cleanly on this page, then repair the noisy ones. */
function finishCards(cards) {
  const prefixes = new Set(KNOWN_PREFIXES);
  for (const c of cards) if (c.epic) prefixes.add(c.epic.slice(0, 3));
  for (const c of cards) {
    if (!c.epic) c.epic = repairEpic([...(c.tokens || [])].sort((x, y) => y.length - x.length)[0], prefixes) || repairEpic((c.tokens || []).join(''), prefixes);
    if (c.epic) KNOWN_PREFIXES.add(c.epic.slice(0, 3));
    delete c.tokens;
  }
  return cards;
}

async function readOneByOne(rows, { work, tesseract, dpi }) {
  const out = [];
  for (const row of rows) {
    const read = async (crop, name) => {
      const file = path.join(work, `${name}.pgm`);
      writePgm(file, crop.w, crop.h, crop.data);
      const text = await run(tesseract, [
        file,
        'stdout',
        '--psm',
        '7',
        '--dpi',
        String(dpi),
        '-c',
        `tessedit_char_whitelist=${WHITELIST}`,
      ]);
      return text.trim();
    };
    const serialText = await read(row.serial, `s${row.slot}`);
    const epicText = await read(row.epic, `e${row.slot}`);
    out.push({
      slot: row.slot,
      serial: repairSerial(serialText),
      epic: null,
      raw: `${serialText} ${epicText}`,
      tokens: [epicText],
    });
  }
  return finishCards(out);
}

module.exports = { readCardHeaders, repairEpic, repairSerial };
