/**
 * Sign-in middleware: loads the session from the cookie, then decides who may call each API route.
 *
 * - The session token lives in an HttpOnly, Secure, SameSite=Strict cookie (JavaScript on the page cannot read it).
 * - The database stores only a hash of the token, so a database leak does not leak live sessions.
 * - Sessions end after IDLE_HOURS of no use or ABSOLUTE_HOURS in total, whichever comes first.
 * - Every change request (POST/PUT/PATCH/DELETE) must carry the X-Requested-With header and come from our own site.
 */
const { hashToken } = require('./security');
const { check } = require('./permissions');

const PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE_NAME = PRODUCTION ? '__Host-cp_session' : 'cp_session';
const IDLE_MS = Number(process.env.SESSION_IDLE_HOURS || 8) * 3600 * 1000;
const ABSOLUTE_MS = Number(process.env.SESSION_ABSOLUTE_HOURS || 24) * 3600 * 1000;

// Paths (relative to /api) that do their own checks or are public.
const PUBLIC = [/^\/health$/, /^\/auth\//, /^\/access\//];
// Allowed while the person still has to choose a new password.
const ALLOWED_BEFORE_PASSWORD_CHANGE = [/^\/auth\/(me|logout|change-password)$/];

function parseCookies(header) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
  return out;
}

function allowedOrigins() {
  const list = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  if (!PRODUCTION) list.push('http://localhost:3000', 'http://127.0.0.1:3000');
  return list;
}

function setSessionCookie(res, token) {
  const maxAge = Math.floor(ABSOLUTE_MS / 1000);
  res.append('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${PRODUCTION ? '; Secure' : ''}`);
}
function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${PRODUCTION ? '; Secure' : ''}`);
}

const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64);

function createAuth({ prisma, fail }) {
  const cache = new Map(); // tokenHash -> { until, value }

  async function lookup(tokenHash) {
    const hit = cache.get(tokenHash);
    if (hit && hit.until > Date.now()) return hit.value;
    const rows = await prisma.$queryRaw`
      SELECT s.id AS session_id, s.last_seen_at, s.created_at AS session_created, s.expires_at,
             u.id, u.username, u.full_name, u.role, u.must_change_password, u.status
      FROM public.auth_sessions s JOIN public.app_users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash} AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`;
    const r = rows[0];
    let value = null;
    if (r && Date.now() - new Date(r.last_seen_at).getTime() < IDLE_MS) {
      value = {
        sessionId: String(r.session_id),
        lastSeen: new Date(r.last_seen_at).getTime(),
        user: { id: String(r.id), username: r.username, fullName: r.full_name, role: r.role, mustChangePassword: r.must_change_password },
      };
    }
    cache.set(tokenHash, { until: Date.now() + 10000, value }); // 10 s: keeps load low, revocation still takes effect almost at once
    if (cache.size > 5000) cache.clear();
    return value;
  }

  /** Attaches req.auth ({user, sessionId}) when the cookie holds a live session. Never blocks. */
  async function loadSession(req, _res, next) {
    req.auth = null;
    try {
      const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
      if (token && token.length >= 40 && token.length <= 128) {
        const th = hashToken(token);
        const s = await lookup(th);
        if (s) {
          req.auth = { ...s, tokenHash: th };
          if (Date.now() - s.lastSeen > 60000) {
            s.lastSeen = Date.now();
            prisma.$executeRaw`UPDATE public.auth_sessions SET last_seen_at = now() WHERE id = ${BigInt(s.sessionId)}`.catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('session lookup failed:', err.message);
    }
    next();
  }

  function forgetSessions() {
    cache.clear();
  }

  /** The lock on every /api route (mounted after loadSession). */
  function gate(req, res, next) {
    const path = req.path;
    const method = req.method.toUpperCase();
    const changes = !['GET', 'HEAD', 'OPTIONS'].includes(method);

    if (changes) {
      if (req.get('x-requested-with') !== 'CivicPulse') return fail(res, 403, 'Request blocked.');
      const origin = req.get('origin');
      if (origin) {
        const host = req.get('host');
        let ok = false;
        try {
          ok = new URL(origin).host === host || allowedOrigins().includes(origin.replace(/\/$/, ''));
        } catch {
          ok = false;
        }
        if (!ok) return fail(res, 403, 'Request blocked.');
      }
    }

    if (PUBLIC.some((re) => re.test(path))) return next();

    if (!req.auth) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Please sign in.' });
    if (req.auth.user.mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.some((re) => re.test(path))) {
      return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Choose a new password to continue.' });
    }
    const verdict = check(method, path, req.auth.user.role);
    if (!verdict.allowed) return fail(res, 403, 'Your role does not allow this.');
    return next();
  }

  /** For routes that need a signed-in user inside a public prefix. */
  function requireUser(req, res, next) {
    if (!req.auth) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Please sign in.' });
    return next();
  }

  return { loadSession, gate, requireUser, forgetSessions };
}

/** { actorRole, actorUser } for the history log, taken from the verified session, never from the request body. */
function actorOf(req) {
  return { actorRole: req.auth?.user?.role || null, actorUser: req.auth?.user?.username || null };
}

module.exports = { createAuth, actorOf, parseCookies, setSessionCookie, clearSessionCookie, clientIp, COOKIE_NAME, IDLE_MS, ABSOLUTE_MS, allowedOrigins };
