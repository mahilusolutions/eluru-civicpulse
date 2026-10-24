/**
 * PDFs for the access flow: the acknowledgement (after a request) and the login slip (after approval).
 * Latin text uses Noto Sans, Telugu text uses Noto Sans Telugu, so names written in either print correctly.
 */
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://eluru.mahilusolutions.com').replace(/\/$/, '');

const C = {
  navy: '#0F1B2D',
  blue: '#1D4E89',
  gold: '#F0B429',
  ink: '#1B2A41',
  muted: '#5B6B80',
  line: '#D8E0EA',
  soft: '#F4F7FB',
  green: '#1F9D63',
  greenSoft: '#E8F6EF',
  amber: '#B7791F',
  amberSoft: '#FFF7E0',
  red: '#C0392B',
};

const W = 595.28;
const M = 44;
const CW = W - M * 2;

function setupFonts(doc) {
  doc.registerFont('Latin', path.join(FONT_DIR, 'NotoSans-Regular.ttf'));
  doc.registerFont('Latin-Bold', path.join(FONT_DIR, 'NotoSans-Bold.ttf'));
  doc.registerFont('Telugu', path.join(FONT_DIR, 'NotoSansTelugu-Regular.ttf'));
  doc.registerFont('Telugu-Bold', path.join(FONT_DIR, 'NotoSansTelugu-Bold.ttf'));
}

const isTelugu = (ch) => /[ఀ-౿]/.test(ch);

/** Splits text into runs so each run is drawn with the font that has its letters. */
function runsOf(str) {
  const runs = [];
  let cur = '';
  let te = null;
  for (const ch of String(str ?? '')) {
    const neutral = /[\s\d.,;:'"()\-/@#&+_!?]/.test(ch);
    const t = neutral && te !== null ? te : isTelugu(ch);
    if (te === null) te = t;
    if (t !== te) {
      runs.push({ text: cur, te });
      cur = '';
      te = t;
    }
    cur += ch;
  }
  if (cur) runs.push({ text: cur, te: te ?? false });
  return runs;
}

/** Draws text at (x, y), switching fonts for Telugu runs. Returns the y below the text. */
function put(doc, str, x, y, { size = 10, bold = false, color = C.ink, width, align = 'left', lineGap = 2, mono = false, spacing = 0 } = {}) {
  const parts = mono ? [{ text: String(str ?? ''), te: false, mono: true }] : runsOf(str);
  doc.fillColor(color).fontSize(size);
  if (!parts.length) return y;
  parts.forEach((r, i) => {
    const font = r.mono ? (bold ? 'Courier-Bold' : 'Courier') : r.te ? (bold ? 'Telugu-Bold' : 'Telugu') : bold ? 'Latin-Bold' : 'Latin';
    doc.font(font);
    const opts = { width, align, lineGap, characterSpacing: spacing, continued: i < parts.length - 1 };
    if (i === 0) doc.text(r.text, x, y, opts);
    else doc.text(r.text, opts);
  });
  return doc.y;
}

const when = (d) =>
  new Date(d || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

function header(doc, kind) {
  doc.rect(0, 0, W, 104).fill(C.navy);
  doc.rect(0, 104, W, 4).fill(C.gold);
  // simple pulse mark
  doc.save().lineWidth(2.4).strokeColor(C.gold).lineJoin('round').lineCap('round');
  doc.moveTo(M, 52).lineTo(M + 10, 52).lineTo(M + 15, 38).lineTo(M + 23, 66).lineTo(M + 29, 46).lineTo(M + 36, 52).lineTo(M + 46, 52).stroke();
  doc.restore();
  put(doc, 'CivicPulse', M + 58, 36, { size: 22, bold: true, color: '#FFFFFF' });
  put(doc, 'Eluru  ·  Assembly Constituency S01-65', M + 58, 64, { size: 9.5, color: '#B9C6D8' });
  put(doc, kind.toUpperCase(), M, 44, { size: 9, bold: true, color: C.gold, width: CW, align: 'right', spacing: 1.6 });
  put(doc, `Issued ${when()}`, M, 60, { size: 8.5, color: '#B9C6D8', width: CW, align: 'right' });
}

function footer(doc, line) {
  const y = 790;
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.6).strokeColor(C.line).stroke();
  put(doc, line, M, y + 9, { size: 8, color: C.muted, width: CW });
  put(doc, `${PUBLIC_URL.replace(/^https?:\/\//, '')}  ·  Mahilu Solutions`, M, y + 9, { size: 8, color: C.muted, width: CW, align: 'right' });
}

function pill(doc, text, x, y, fg, bg) {
  doc.font('Latin-Bold').fontSize(8);
  const w = doc.widthOfString(text, { characterSpacing: 1 }) + 22;
  doc.roundedRect(x, y, w, 20, 10).fill(bg);
  put(doc, text, x, y + 6, { size: 8, bold: true, color: fg, width: w, align: 'center', spacing: 1 });
  return w;
}

function label(doc, text, x, y, w) {
  return put(doc, text.toUpperCase(), x, y, { size: 7.5, bold: true, color: C.muted, width: w, spacing: 1 });
}

/** A labelled value in a grid cell. */
function field(doc, labelText, value, x, y, w) {
  label(doc, labelText, x, y, w);
  const bottom = put(doc, value || '—', x, y + 12, { size: 10.5, color: C.ink, width: w, lineGap: 1.5 });
  return bottom;
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

const newDoc = (title, author) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: title, Author: author || 'CivicPulse', Creator: 'CivicPulse' } });
  setupFonts(doc);
  return doc;
};

/** The receipt a person downloads after raising a request. */
async function buildAcknowledgementPdf(req, roleLabel) {
  const doc = newDoc(`Access request ${req.reference}`);
  header(doc, 'Acknowledgement');

  put(doc, 'Your access request has been received', M, 132, { size: 20, bold: true, color: C.navy, width: CW });
  put(doc, `Submitted on ${when(req.created_at)}. The administrator will review it and you can follow the progress with the reference number below.`, M, 160, { size: 10, color: C.muted, width: CW - 20 });

  // Reference card
  const cardY = 204;
  doc.roundedRect(M, cardY, CW, 108, 10).fill(C.soft);
  doc.roundedRect(M, cardY, CW, 108, 10).lineWidth(0.8).strokeColor(C.line).stroke();
  doc.rect(M, cardY + 14, 4, 80).fill(C.gold);
  label(doc, 'Reference number', M + 22, cardY + 16, 300);
  put(doc, req.reference, M + 22, cardY + 32, { size: 32, bold: true, color: C.navy, spacing: 1.5 });
  put(doc, 'Keep this number safe. To check your status you need it together with the mobile number you gave.', M + 22, cardY + 76, { size: 8.8, color: C.muted, width: 330 });
  const qr = await QRCode.toBuffer(`${PUBLIC_URL}/request-status?ref=${encodeURIComponent(req.reference)}`, { margin: 0, width: 240, errorCorrectionLevel: 'M', color: { dark: C.navy, light: '#FFFFFF' } });
  doc.roundedRect(W - M - 100, cardY + 12, 88, 88, 6).fill('#FFFFFF');
  doc.image(qr, W - M - 94, cardY + 18, { width: 76 });
  pill(doc, 'RECEIVED  ·  UNDER REVIEW', M + 22, cardY - 10, C.amber, C.amberSoft);

  // Details
  let y = 340;
  put(doc, 'Request details', M, y, { size: 12, bold: true, color: C.navy });
  doc.moveTo(M, y + 19).lineTo(W - M, y + 19).lineWidth(0.6).strokeColor(C.line).stroke();
  y += 30;
  const colW = (CW - 24) / 2;
  const rows = [
    [['Applicant name', req.full_name], ['Mobile number', req.mobile]],
    [['Email', req.email], ['Designation / organisation', req.designation]],
    [['Area (ward / booth / locality)', req.area], ['Role requested', roleLabel]],
    [['Voter ID (EPIC)', req.voter_id], ['Recommended by', req.referred_by]],
  ];
  for (const [a, b] of rows) {
    const y1 = field(doc, a[0], a[1], M, y, colW);
    const y2 = field(doc, b[0], b[1], M + colW + 24, y, colW);
    y = Math.max(y1, y2) + 12;
  }
  label(doc, 'Why access is needed', M, y, CW);
  const reasonBottom = put(doc, req.reason, M + 10, y + 18, { size: 10, color: C.ink, width: CW - 20, lineGap: 2 });
  doc.roundedRect(M, y + 10, CW, reasonBottom - y - 4, 6).lineWidth(0.7).strokeColor(C.line).stroke();
  y = reasonBottom + 24;

  // What happens next
  put(doc, 'What happens next', M, y, { size: 12, bold: true, color: C.navy });
  y += 24;
  const steps = [
    ['1', 'Review', 'The administrator reads your request and the reason you gave.'],
    ['2', 'Decision', 'You are approved with a role, or told why it was not approved.'],
    ['3', 'Collect your login', 'Open the website, choose “Check request status” and enter your reference and mobile number.'],
  ];
  const sw = (CW - 28) / 3;
  steps.forEach(([n, t, d], i) => {
    const x = M + i * (sw + 14);
    doc.roundedRect(x, y, sw, 92, 8).fill(C.soft);
    doc.circle(x + 18, y + 18, 9).fill(C.navy);
    put(doc, n, x + 9, y + 13.5, { size: 9, bold: true, color: '#FFFFFF', width: 18, align: 'center' });
    put(doc, t, x + 34, y + 12, { size: 10, bold: true, color: C.navy, width: sw - 44 });
    put(doc, d, x + 12, y + 38, { size: 8.6, color: C.muted, width: sw - 24, lineGap: 1.5 });
  });

  footer(doc, 'System-generated acknowledgement. It is not a login and does not grant access.');
  return toBuffer(doc);
}

/** The slip with the username and the one-time password, produced at the moment the person collects them. */
async function buildCredentialsPdf({ reference, fullName, username, password, roleLabel, note }) {
  const doc = newDoc(`CivicPulse login ${username}`);
  header(doc, 'Login details');

  put(doc, 'Your access has been approved', M, 132, { size: 20, bold: true, color: C.navy, width: CW });
  put(doc, `Welcome, ${fullName}. Use the details below to sign in. You will be asked to choose your own password straight away.`, M, 160, { size: 10, color: C.muted, width: CW - 20 });
  pill(doc, 'APPROVED', M, 188, C.green, C.greenSoft);
  put(doc, `Role: ${roleLabel}`, M + 100, 192, { size: 10, bold: true, color: C.navy });

  // Credential boxes
  const y0 = 228;
  const bw = (CW - 18) / 2;
  const box = (x, lab, value) => {
    doc.roundedRect(x, y0, bw, 92, 10).fill(C.soft);
    doc.roundedRect(x, y0, bw, 92, 10).lineWidth(0.8).strokeColor(C.line).stroke();
    doc.rect(x, y0 + 14, 4, 64).fill(C.gold);
    label(doc, lab, x + 20, y0 + 16, bw - 30);
    put(doc, value, x + 20, y0 + 40, { size: 20, bold: true, color: C.navy, mono: true, width: bw - 28 });
  };
  box(M, 'Username', username);
  box(M + bw + 18, 'Temporary password', password);

  // Warning
  let y = y0 + 114;
  doc.roundedRect(M, y, CW, 64, 8).fill(C.amberSoft);
  doc.rect(M, y, 4, 64).fill(C.gold);
  put(doc, 'Read this before you close the page', M + 18, y + 10, { size: 10, bold: true, color: C.amber });
  put(doc, 'This password is shown once. It only works for your first sign-in, then you must replace it with your own. Do not share it, post it or photograph it. If you lose it, ask the administrator for a reset.', M + 18, y + 26, { size: 9, color: '#6B4E0E', width: CW - 36, lineGap: 1.5 });

  // Steps
  y += 92;
  put(doc, 'How to sign in', M, y, { size: 12, bold: true, color: C.navy });
  y += 26;
  const steps = [
    ['1', `Open ${PUBLIC_URL.replace(/^https?:\/\//, '')} in your browser.`],
    ['2', 'Enter the username and temporary password above, then press Sign in.'],
    ['3', 'Choose a new password of at least 10 characters. Use letters and numbers.'],
    ['4', 'You are in. The menu shows what your role can use.'],
  ];
  steps.forEach(([n, t]) => {
    doc.circle(M + 10, y + 8, 9).fill(C.navy);
    put(doc, n, M + 1, y + 3.5, { size: 9, bold: true, color: '#FFFFFF', width: 18, align: 'center' });
    put(doc, t, M + 30, y + 3, { size: 10, color: C.ink, width: CW - 40 });
    y += 30;
  });

  if (note) {
    y += 6;
    label(doc, 'Note from the administrator', M, y, CW);
    put(doc, note, M, y + 14, { size: 10, color: C.ink, width: CW, lineGap: 2 });
  }

  // reference line
  put(doc, `Request reference  ${reference}`, M, 752, { size: 9, color: C.muted, width: CW });
  footer(doc, 'Confidential. Keep this slip private and delete it after you have set your own password.');
  return toBuffer(doc);
}

module.exports = { buildAcknowledgementPdf, buildCredentialsPdf };
