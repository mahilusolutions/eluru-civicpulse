/**
 * Security primitives: password hashing, session tokens, random credentials, reference numbers,
 * and encryption for the one-time credential hand-over. Only Node's built-in crypto is used.
 */
const crypto = require('crypto');

// ---------- Passwords (scrypt, per-password random salt, constant-time compare) ----------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

/** Format: scrypt$N$r$p$salt(b64)$hash(b64) */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const params = { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), keylen: 64 };
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  try {
    const key = await scrypt(password, salt, { ...params, keylen: expected.length });
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// A real hash to compare against when the username does not exist, so "wrong user" and "wrong password" take the same time.
let dummyHash;
async function dummyVerify(password) {
  if (!dummyHash) dummyHash = await hashPassword(crypto.randomBytes(12).toString('hex'));
  await verifyPassword(password, dummyHash);
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', '123456', '1234567', '12345678', '123456789', '1234567890', 'qwerty', 'qwerty123',
  'qwertyuiop', 'abc123', 'abcd1234', 'iloveyou', 'admin', 'admin123', 'admin@123', 'letmein', 'welcome', 'welcome1', 'welcome123',
  'india123', 'india@123', 'eluru', 'eluru123', 'eluru@123', 'civicpulse', 'civicpulse1', 'civicpulse123', 'changeme', 'p@ssw0rd', 'passw0rd',
  'test1234', 'user1234', 'monkey', 'dragon', 'football', 'cricket', 'cricket123', 'sachin', 'jaihind', 'jaihind123',
]);

/** Returns a list of problems (empty = acceptable). */
function passwordProblems(password, { username = '', fullName = '', mobile = '' } = {}) {
  const p = String(password || '');
  const problems = [];
  if (p.length < 10) problems.push('Use at least 10 characters.');
  if (p.length > 128) problems.push('Use at most 128 characters.');
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) problems.push('Include letters and at least one number.');
  const lower = p.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) problems.push('This password is too common.');
  if (/^(.)\1+$/.test(p)) problems.push('Do not repeat one character.');
  if (username && lower.includes(String(username).toLowerCase().split('.')[0]) && String(username).split('.')[0].length >= 4) problems.push('Do not use your username in the password.');
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length >= 6 && lower.includes(digits.slice(-6))) problems.push('Do not use your phone number in the password.');
  const first = String(fullName || '').toLowerCase().split(/\s+/)[0];
  if (first && first.length >= 4 && lower.includes(first)) problems.push('Do not use your name in the password.');
  return problems;
}

// ---------- Session tokens (the browser holds the token; the database only holds its hash) ----------
function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// ---------- Random credentials (no look-alike characters: no 0/O, 1/l/I) ----------
const ALPHABET_PASS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALPHABET_REF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 symbols, upper case only

function randomFrom(alphabet, length) {
  let out = '';
  while (out.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < Math.floor(256 / alphabet.length) * alphabet.length) out += alphabet[byte % alphabet.length]; // unbiased
  }
  return out;
}

/** e.g. Kx7mQ4pR9tWn -> shown as Kx7m-Q4pR-9tWn (about 68 bits). The dashes are for reading only; they are part of the password. */
function generatePassword() {
  return [randomFrom(ALPHABET_PASS, 4), randomFrom(ALPHABET_PASS, 4), randomFrom(ALPHABET_PASS, 4)].join('-');
}

/** e.g. CPR-7K3M-9QX2 (8 random symbols, ~40 bits). */
function generateReference() {
  return `CPR-${randomFrom(ALPHABET_REF, 4)}-${randomFrom(ALPHABET_REF, 4)}`;
}

const normalizeReference = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^CPR/, '');
const referenceKey = (v) => {
  const k = normalizeReference(v);
  return k.length === 8 ? `CPR-${k.slice(0, 4)}-${k.slice(4)}` : null;
};

// ---------- Usernames: easy to remember = first name + last initial + last 4 digits of the phone ----------
function baseUsername(fullName, mobile) {
  const words = String(fullName || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, ' ') // Telugu or other scripts cannot be used in a username
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const first = words.find((w) => w.length >= 2) || 'user';
  const rest = words.slice(words.indexOf(first) + 1);
  const last = rest.length ? rest[rest.length - 1] : '';
  const digits = String(mobile || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `${first.slice(0, 12)}${last ? last[0] : ''}.${digits}`;
}

// ---------- Encryption of the one-time credential hand-over (AES-256-GCM) ----------
function secretKey() {
  const hex = process.env.AUTH_SECRET || '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('AUTH_SECRET is not set (needs 64 hex characters). Run: node scripts/generateSecret.js');
  return Buffer.from(hex, 'hex');
}

function encryptSecret(plain, aad = '') {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  cipher.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

function decryptSecret(blob, aad = '') {
  const [v, iv, tag, enc] = String(blob || '').split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('bad credential blob');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64url')), decipher.final()]).toString('utf8');
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = {
  hashPassword,
  verifyPassword,
  dummyVerify,
  passwordProblems,
  newSessionToken,
  hashToken,
  generatePassword,
  generateReference,
  referenceKey,
  baseUsername,
  encryptSecret,
  decryptSecret,
  safeEqual,
};
