/** Sign in, sign out, who am I, change password. */
const rateLimit = require('express-rate-limit');
const { hashPassword, verifyPassword, dummyVerify, passwordProblems, newSessionToken, hashToken } = require('../lib/security');
const { ROLE_LABELS } = require('../lib/authStore');
const { setSessionCookie, clearSessionCookie, clientIp, ABSOLUTE_MS } = require('../lib/authMiddleware');
const { logAudit } = require('../lib/audit');

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const GENERIC = 'Wrong username or password.';

const publicUser = (u) => ({
  id: String(u.id),
  username: u.username,
  full_name: u.fullName || u.full_name,
  role: u.role,
  role_label: ROLE_LABELS[u.role] || u.role,
  must_change_password: Boolean(u.mustChangePassword ?? u.must_change_password),
});

module.exports = function registerAuth({ app, prisma, fail, ok, asyncHandler, auth }) {
  // Counts only failed attempts, so honest users are never slowed down.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many failed attempts from this network. Please wait 15 minutes.' },
  });

  app.post(
    '/api/auth/login',
    loginLimiter,
    asyncHandler(async (req, res) => {
      const username = String(req.body?.username || '').trim().toLowerCase().slice(0, 60);
      const password = String(req.body?.password || '').slice(0, 200);
      if (!username || !password) return fail(res, 400, 'Enter your username and password.');

      const rows = await prisma.$queryRaw`SELECT * FROM public.app_users WHERE lower(username) = ${username}`;
      const u = rows[0];
      const ip = clientIp(req);

      if (!u || u.status !== 'active') {
        await dummyVerify(password); // same time as a real check, so nobody can tell which usernames exist
        await logAudit(prisma, { entity: 'auth', action: 'login_failed', actorUser: username.slice(0, 40), summary: `Failed sign-in (${u ? 'account disabled' : 'unknown username'}) from ${ip}` });
        return fail(res, 401, GENERIC);
      }

      if (u.locked_until && new Date(u.locked_until) > new Date()) {
        const mins = Math.max(1, Math.ceil((new Date(u.locked_until) - Date.now()) / 60000));
        return fail(res, 429, `This account is locked after too many wrong passwords. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
      }

      const good = await verifyPassword(password, u.password_hash);
      if (!good) {
        const attempts = u.failed_attempts + 1;
        const lock = attempts >= MAX_FAILS;
        await prisma.$executeRaw`
          UPDATE public.app_users
          SET failed_attempts = ${lock ? 0 : attempts}, locked_until = ${lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null}
          WHERE id = ${u.id}`;
        await logAudit(prisma, {
          entity: 'auth', entityId: u.id, action: lock ? 'account_locked' : 'login_failed', actorUser: u.username,
          summary: lock ? `Account locked for ${LOCK_MINUTES} minutes after ${MAX_FAILS} wrong passwords (from ${ip})` : `Wrong password (${attempts}/${MAX_FAILS}) from ${ip}`,
        });
        return lock
          ? fail(res, 429, `Too many wrong passwords. This account is locked for ${LOCK_MINUTES} minutes.`)
          : fail(res, 401, GENERIC);
      }

      // New session for every sign-in (never reuse an old one), and tidy up this person's finished sessions.
      const token = newSessionToken();
      await prisma.$executeRaw`DELETE FROM public.auth_sessions WHERE user_id = ${u.id} AND (expires_at < now() OR revoked_at IS NOT NULL)`;
      await prisma.$executeRaw`
        INSERT INTO public.auth_sessions (user_id, token_hash, expires_at, ip, user_agent)
        VALUES (${u.id}, ${hashToken(token)}, ${new Date(Date.now() + ABSOLUTE_MS)}, ${ip}, ${String(req.get('user-agent') || '').slice(0, 200)})`;
      await prisma.$executeRaw`UPDATE public.app_users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = ${u.id}`;
      await logAudit(prisma, { entity: 'auth', entityId: u.id, action: 'login', actorRole: u.role, actorUser: u.username, summary: `Signed in from ${ip}` });

      setSessionCookie(res, token);
      return ok(res, { user: publicUser(u) });
    })
  );

  app.get('/api/auth/me', (req, res) => {
    if (!req.auth) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Please sign in.' });
    return ok(res, { user: publicUser(req.auth.user) });
  });

  app.post(
    '/api/auth/logout',
    asyncHandler(async (req, res) => {
      if (req.auth) {
        await prisma.$executeRaw`UPDATE public.auth_sessions SET revoked_at = now() WHERE token_hash = ${req.auth.tokenHash}`;
        auth.forgetSessions();
        await logAudit(prisma, { entity: 'auth', entityId: req.auth.user.id, action: 'logout', actorRole: req.auth.user.role, actorUser: req.auth.user.username, summary: 'Signed out' });
      }
      clearSessionCookie(res);
      return ok(res, { signed_out: true });
    })
  );

  app.post(
    '/api/auth/change-password',
    auth.requireUser,
    asyncHandler(async (req, res) => {
      const current = String(req.body?.current_password || '');
      const next = String(req.body?.new_password || '');
      const [u] = await prisma.$queryRaw`SELECT * FROM public.app_users WHERE id = ${BigInt(req.auth.user.id)}`;
      if (!u) return fail(res, 401, 'Please sign in again.');
      if (!(await verifyPassword(current, u.password_hash))) return fail(res, 400, 'Your current password is not correct.');
      if (current === next) return fail(res, 400, 'Choose a password different from the current one.');
      const problems = passwordProblems(next, { username: u.username, fullName: u.full_name, mobile: u.mobile });
      if (problems.length) return fail(res, 400, problems.join(' '));

      const hash = await hashPassword(next);
      await prisma.$executeRaw`
        UPDATE public.app_users SET password_hash = ${hash}, must_change_password = false, password_changed_at = now(), failed_attempts = 0, locked_until = NULL
        WHERE id = ${u.id}`;
      // Every other device is signed out; this one stays.
      await prisma.$executeRaw`UPDATE public.auth_sessions SET revoked_at = now() WHERE user_id = ${u.id} AND token_hash <> ${req.auth.tokenHash} AND revoked_at IS NULL`;
      // The one-time hand-over copy of the old temporary password is no longer needed.
      await prisma.$executeRaw`UPDATE public.access_requests SET credential_cipher = NULL WHERE user_id = ${u.id}`;
      auth.forgetSessions();
      await logAudit(prisma, { entity: 'auth', entityId: u.id, action: 'password_changed', actorRole: u.role, actorUser: u.username, summary: 'Password changed; other sessions signed out' });
      return ok(res, { user: publicUser({ ...u, must_change_password: false }) });
    })
  );

  // nginx asks this before letting anyone into the OCR upload tool (/ocr/).
  app.get('/api/auth/verify-ocr', (req, res) => {
    if (!req.auth) return res.status(401).end();
    if (req.auth.user.mustChangePassword || !['super_admin', 'admin'].includes(req.auth.user.role)) return res.status(403).end();
    return res.status(204).end();
  });
};
