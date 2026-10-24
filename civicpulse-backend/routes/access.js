/**
 * Access requests.
 *
 * Public:   raise a request, check its status, download the acknowledgement, collect the login once approved.
 * Admin:    (Super Admin only) read requests, approve with a role (creates the account), reject with a reason,
 *           and manage accounts.
 */
const rateLimit = require('express-rate-limit');
const {
  hashPassword, generatePassword, generateReference, referenceKey, baseUsername, encryptSecret, decryptSecret, safeEqual,
} = require('../lib/security');
const { ROLES, ROLE_LABELS, REQUESTABLE_ROLES, normalizeMobile } = require('../lib/authStore');
const { buildAcknowledgementPdf, buildCredentialsPdf } = require('../lib/pdf');
const { logAudit } = require('../lib/audit');
const { actorOf, clientIp } = require('../lib/authMiddleware');

const CREDENTIAL_DAYS = 7;
const MAX_STATUS_TRIES = 8;
const LOCK_MINUTES = 15;
const NOT_FOUND = 'We could not find a request that matches these details. Check the reference number and the mobile number.';

const clean = (v, max) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const publicUrl = () => (process.env.PUBLIC_URL || 'https://eluru.mahilusolutions.com').replace(/\/$/, '');

module.exports = function registerAccess({ app, prisma, ok, fail, asyncHandler, auth }) {
  const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 6,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests from this network. Please try again in an hour.' },
  });
  const lookupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Please try again later.' },
  });

  /** Finds a request by reference + mobile, with a lock-out after repeated wrong mobile numbers. Returns a row or sends the error. */
  async function findVerified(req, res) {
    const ref = referenceKey(req.body?.reference);
    const mobile = normalizeMobile(req.body?.mobile);
    if (!ref || !mobile) {
      fail(res, 400, 'Enter the reference number (like CPR-7K3M-9QX2) and the 10-digit mobile number.');
      return null;
    }
    const [row] = await prisma.$queryRaw`SELECT * FROM public.access_requests WHERE reference = ${ref}`;
    if (!row) {
      fail(res, 404, NOT_FOUND);
      return null;
    }
    if (row.status_locked_until && new Date(row.status_locked_until) > new Date()) {
      fail(res, 429, 'Too many wrong attempts for this request. Please try again in a few minutes.');
      return null;
    }
    if (!safeEqual(row.mobile, mobile)) {
      const tries = row.status_attempts + 1;
      const lock = tries >= MAX_STATUS_TRIES;
      await prisma.$executeRaw`
        UPDATE public.access_requests SET status_attempts = ${lock ? 0 : tries}, status_locked_until = ${lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null}
        WHERE id = ${row.id}`;
      if (lock) await logAudit(prisma, { entity: 'access_request', entityId: row.id, action: 'status_locked', summary: `Status checks locked for ${LOCK_MINUTES} minutes after ${MAX_STATUS_TRIES} wrong mobile numbers (from ${clientIp(req)})` });
      fail(res, 404, NOT_FOUND);
      return null;
    }
    if (row.status_attempts) await prisma.$executeRaw`UPDATE public.access_requests SET status_attempts = 0, status_locked_until = NULL WHERE id = ${row.id}`;
    return row;
  }

  const credentialsReady = (r) =>
    r.status === 'approved' && Boolean(r.credential_cipher) && !r.credential_revealed_at && r.credential_expires_at && new Date(r.credential_expires_at) > new Date();

  async function statusView(r) {
    const view = {
      reference: r.reference,
      status: r.status,
      submitted_at: r.created_at,
      decided_at: r.decided_at,
      full_name: r.full_name,
      mobile: r.mobile,
      email: r.email,
      designation: r.designation,
      area: r.area,
      requested_role: r.requested_role,
      requested_role_label: ROLE_LABELS[r.requested_role] || r.requested_role,
      voter_id: r.voter_id,
      reason: r.reason,
      referred_by: r.referred_by,
      note: r.status === 'pending' ? null : r.admin_note,
      account: null,
    };
    if (r.status === 'approved' && r.user_id) {
      const [u] = await prisma.$queryRaw`SELECT username, role FROM public.app_users WHERE id = ${r.user_id}`;
      if (u) {
        view.account = {
          username: u.username,
          role: u.role,
          role_label: ROLE_LABELS[u.role] || u.role,
          credentials_available: credentialsReady(r),
          credentials_collected: Boolean(r.credential_revealed_at),
          credentials_expired: !r.credential_revealed_at && r.credential_expires_at && new Date(r.credential_expires_at) <= new Date(),
          credentials_expire_at: r.credential_expires_at,
        };
      }
    }
    return view;
  }

  // ---------------------------------------------------------------- public

  app.post(
    '/api/access/requests',
    submitLimiter,
    asyncHandler(async (req, res) => {
      const b = req.body || {};
      if (b.website) return fail(res, 400, 'Could not submit this request.'); // hidden field: only automated forms fill it

      const full_name = clean(b.full_name, 80);
      const mobile = normalizeMobile(b.mobile);
      const email = clean(b.email, 120).toLowerCase();
      const designation = clean(b.designation, 80);
      const area = clean(b.area, 120);
      const requested_role = String(b.requested_role || '');
      const voter_id = clean(b.voter_id, 20).toUpperCase().replace(/[^A-Z0-9/]/g, '');
      const reason = clean(b.reason, 500);
      const referred_by = clean(b.referred_by, 120);

      const errors = {};
      if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]{2,79}$/u.test(full_name)) errors.full_name = 'Enter your full name (letters only).';
      if (!mobile) errors.mobile = 'Enter a valid 10-digit mobile number.';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email address or leave it empty.';
      if (designation.length < 2) errors.designation = 'Tell us your role or organisation.';
      if (area.length < 2) errors.area = 'Enter your ward, booth or locality.';
      if (!REQUESTABLE_ROLES.includes(requested_role)) errors.requested_role = 'Choose the access you need.';
      if (voter_id && !/^[A-Z0-9/]{8,16}$/.test(voter_id)) errors.voter_id = 'Voter ID looks wrong (for example WIO2501872) or leave it empty.';
      if (reason.length < 10) errors.reason = 'Please write at least a sentence about why you need access.';
      if (b.consent !== true) errors.consent = 'Please confirm the declaration.';
      if (Object.keys(errors).length) return res.status(400).json({ success: false, message: 'Please correct the highlighted fields.', errors });

      const [pending] = await prisma.$queryRaw`SELECT 1 AS x FROM public.access_requests WHERE mobile = ${mobile} AND status = 'pending' LIMIT 1`;
      if (pending) {
        return res.status(409).json({ success: false, message: 'A request for this mobile number is already waiting for review. Use “Check request status” with your reference number.', errors: { mobile: 'Already has a pending request.' } });
      }
      const [account] = await prisma.$queryRaw`SELECT 1 AS x FROM public.app_users WHERE mobile = ${mobile} AND status = 'active' LIMIT 1`;
      if (account) {
        return res.status(409).json({ success: false, message: 'This mobile number already has an account. Sign in, or ask the administrator if you forgot the password.', errors: { mobile: 'Already has an account.' } });
      }

      let row = null;
      for (let i = 0; i < 6 && !row; i += 1) {
        try {
          [row] = await prisma.$queryRaw`
            INSERT INTO public.access_requests (reference, full_name, mobile, email, designation, area, requested_role, voter_id, reason, referred_by, ip, user_agent)
            VALUES (${generateReference()}, ${full_name}, ${mobile}, ${email || null}, ${designation}, ${area}, ${requested_role}, ${voter_id || null}, ${reason}, ${referred_by || null},
                    ${clientIp(req)}, ${clean(req.get('user-agent'), 200)})
            RETURNING id, reference, created_at`;
        } catch (err) {
          if (!/unique|duplicate/i.test(err.message)) throw err; // reference collision: try another
        }
      }
      if (!row) return fail(res, 500, 'Could not create the request. Please try again.');

      await logAudit(prisma, { entity: 'access_request', entityId: row.id, action: 'create', summary: `Access request ${row.reference} from ${full_name} (${ROLE_LABELS[requested_role]})`, actorUser: 'public' });
      return ok(res, { reference: row.reference, submitted_at: row.created_at });
    })
  );

  app.post(
    '/api/access/status',
    lookupLimiter,
    asyncHandler(async (req, res) => {
      const row = await findVerified(req, res);
      if (!row) return null;
      return ok(res, await statusView(row));
    })
  );

  app.post(
    '/api/access/acknowledgement',
    lookupLimiter,
    asyncHandler(async (req, res) => {
      const row = await findVerified(req, res);
      if (!row) return null;
      const pdf = await buildAcknowledgementPdf(row, ROLE_LABELS[row.requested_role] || row.requested_role);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="CivicPulse-Acknowledgement-${row.reference}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(pdf);
    })
  );

  // The login is handed over once. After this the temporary password is wiped from the database.
  app.post(
    '/api/access/credentials',
    lookupLimiter,
    asyncHandler(async (req, res) => {
      const row = await findVerified(req, res);
      if (!row) return null;
      if (row.status !== 'approved') return fail(res, 409, 'This request has not been approved.');
      if (row.credential_revealed_at) return fail(res, 410, 'The login details were already collected. If they are lost, ask the administrator to reset your password.');
      if (!credentialsReady(row)) return fail(res, 410, 'The login details are no longer available. Ask the administrator to reset your password.');

      // Take the secret atomically: only one request can ever win this update.
      const [claimed] = await prisma.$queryRaw`
        UPDATE public.access_requests SET credential_revealed_at = now()
        WHERE id = ${row.id} AND credential_revealed_at IS NULL AND credential_cipher IS NOT NULL
        RETURNING credential_cipher`;
      if (!claimed) return fail(res, 410, 'The login details were already collected.');
      let password;
      try {
        password = decryptSecret(claimed.credential_cipher, row.reference);
      } catch {
        return fail(res, 500, 'The login details could not be read. Ask the administrator to reset your password.');
      }
      await prisma.$executeRaw`UPDATE public.access_requests SET credential_cipher = NULL WHERE id = ${row.id}`;

      const [u] = await prisma.$queryRaw`SELECT username, role FROM public.app_users WHERE id = ${row.user_id}`;
      const roleLabel = ROLE_LABELS[u.role] || u.role;
      const pdf = await buildCredentialsPdf({ reference: row.reference, fullName: row.full_name, username: u.username, password, roleLabel, note: row.admin_note });
      await logAudit(prisma, { entity: 'access_request', entityId: row.id, action: 'credentials_collected', actorUser: u.username, summary: `Login details collected for ${row.reference}` });
      res.setHeader('Cache-Control', 'no-store');
      return ok(res, { username: u.username, password, role: u.role, role_label: roleLabel, login_url: publicUrl(), pdf_base64: pdf.toString('base64'), file_name: `CivicPulse-Login-${u.username}.pdf` });
    })
  );

  // ---------------------------------------------------------------- Super Admin

  app.get(
    '/api/admin/access-requests/summary',
    asyncHandler(async (_req, res) => {
      const rows = await prisma.$queryRaw`SELECT status, COUNT(*)::int AS n FROM public.access_requests GROUP BY status`;
      const out = { pending: 0, approved: 0, rejected: 0 };
      rows.forEach((r) => {
        out[r.status] = r.n;
      });
      return ok(res, out);
    })
  );

  app.get(
    '/api/admin/access-requests',
    asyncHandler(async (req, res) => {
      const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
      const q = clean(req.query.q, 60);
      const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
      const rows = await prisma.$queryRaw`
        SELECT r.id, r.reference, r.full_name, r.mobile, r.email, r.designation, r.area, r.requested_role, r.voter_id, r.reason, r.referred_by,
               r.status, r.admin_note, r.created_at, r.decided_at, r.credential_revealed_at, u.username AS account_username, u.role AS account_role,
               d.username AS decided_by_name
        FROM public.access_requests r
        LEFT JOIN public.app_users u ON u.id = r.user_id
        LEFT JOIN public.app_users d ON d.id = r.decided_by
        WHERE (${status}::text IS NULL OR r.status = ${status})
          AND (${like}::text IS NULL OR r.full_name ILIKE ${like} OR r.mobile LIKE ${like} OR r.reference ILIKE ${like} OR r.area ILIKE ${like})
        ORDER BY (r.status = 'pending') DESC, r.created_at DESC
        LIMIT 500`;
      return ok(res, rows);
    })
  );

  async function uniqueUsername(tx, fullName, mobile) {
    const base = baseUsername(fullName, mobile);
    for (let i = 1; i <= 30; i += 1) {
      const candidate = i === 1 ? base : `${base}${i}`;
      const [hit] = await tx.$queryRaw`SELECT 1 AS x FROM public.app_users WHERE lower(username) = ${candidate}`;
      if (!hit) return candidate;
    }
    return `${base}${Math.floor(Math.random() * 900 + 100)}`;
  }

  app.post(
    '/api/admin/access-requests/:id/approve',
    asyncHandler(async (req, res) => {
      const id = BigInt(req.params.id);
      const role = String(req.body?.role || '');
      const note = clean(req.body?.note, 300);
      if (!REQUESTABLE_ROLES.includes(role)) return fail(res, 400, 'Choose a role for this account.');
      const actor = actorOf(req);
      const password = generatePassword();
      const hash = await hashPassword(password);

      const result = await prisma.$transaction(async (tx) => {
        const [r] = await tx.$queryRaw`SELECT * FROM public.access_requests WHERE id = ${id} FOR UPDATE`;
        if (!r) return { error: [404, 'Request not found.'] };
        if (r.status !== 'pending') return { error: [409, `This request was already ${r.status}.`] };
        const [taken] = await tx.$queryRaw`SELECT 1 AS x FROM public.app_users WHERE mobile = ${r.mobile} AND status = 'active' LIMIT 1`;
        if (taken) return { error: [409, 'This mobile number already has an account.'] };

        const username = await uniqueUsername(tx, r.full_name, r.mobile);
        const [u] = await tx.$queryRaw`
          INSERT INTO public.app_users (username, full_name, mobile, email, role, password_hash, must_change_password, created_by, request_id)
          VALUES (${username}, ${r.full_name}, ${r.mobile}, ${r.email}, ${role}, ${hash}, true, ${BigInt(req.auth.user.id)}, ${r.id})
          RETURNING id, username`;
        await tx.$executeRaw`
          UPDATE public.access_requests
          SET status = 'approved', admin_note = ${note || null}, decided_by = ${BigInt(req.auth.user.id)}, decided_at = now(), user_id = ${u.id},
              credential_cipher = ${encryptSecret(password, r.reference)}, credential_expires_at = ${new Date(Date.now() + CREDENTIAL_DAYS * 86400000)}, credential_revealed_at = NULL
          WHERE id = ${r.id}`;
        return { user: u, reference: r.reference, name: r.full_name };
      });
      if (result.error) return fail(res, result.error[0], result.error[1]);

      await logAudit(prisma, { entity: 'access_request', entityId: id, action: 'approve', ...actor, summary: `Approved ${result.reference} as ${ROLE_LABELS[role]}; account ${result.user.username} created` });
      return ok(res, { username: result.user.username, role, role_label: ROLE_LABELS[role], reference: result.reference });
    })
  );

  app.post(
    '/api/admin/access-requests/:id/reject',
    asyncHandler(async (req, res) => {
      const id = BigInt(req.params.id);
      const reason = clean(req.body?.reason, 300);
      if (reason.length < 5) return fail(res, 400, 'Write a short reason. The applicant will see it.');
      const [r] = await prisma.$queryRaw`
        UPDATE public.access_requests
        SET status = 'rejected', admin_note = ${reason}, decided_by = ${BigInt(req.auth.user.id)}, decided_at = now()
        WHERE id = ${id} AND status = 'pending' RETURNING reference`;
      if (!r) return fail(res, 409, 'This request is no longer pending.');
      await logAudit(prisma, { entity: 'access_request', entityId: id, action: 'reject', ...actorOf(req), summary: `Rejected ${r.reference}: ${reason}` });
      return ok(res, { reference: r.reference });
    })
  );

  // ---- accounts

  app.get(
    '/api/admin/users',
    asyncHandler(async (_req, res) => {
      const rows = await prisma.$queryRaw`
        SELECT u.id, u.username, u.full_name, u.mobile, u.email, u.role, u.status, u.must_change_password, u.last_login_at, u.created_at, u.locked_until,
               (SELECT COUNT(*)::int FROM public.auth_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS active_sessions
        FROM public.app_users u ORDER BY (u.status = 'active') DESC, u.created_at DESC LIMIT 1000`;
      return ok(res, rows);
    })
  );

  /** Super Admin accounts are not edited from the screen; everyone else can be. */
  async function targetUser(req, res) {
    const id = BigInt(req.params.id);
    const [u] = await prisma.$queryRaw`SELECT * FROM public.app_users WHERE id = ${id}`;
    if (!u) {
      fail(res, 404, 'Account not found.');
      return null;
    }
    if (u.role === 'super_admin') {
      fail(res, 403, 'Super Admin accounts cannot be changed here.');
      return null;
    }
    return u;
  }

  app.patch(
    '/api/admin/users/:id',
    asyncHandler(async (req, res) => {
      const u = await targetUser(req, res);
      if (!u) return null;
      const role = req.body?.role;
      const status = req.body?.status;
      if (role !== undefined && !REQUESTABLE_ROLES.includes(role)) return fail(res, 400, 'Choose a valid role.');
      if (status !== undefined && !['active', 'disabled'].includes(status)) return fail(res, 400, 'Invalid status.');
      if (role === undefined && status === undefined) return fail(res, 400, 'Nothing to change.');
      await prisma.$executeRaw`UPDATE public.app_users SET role = COALESCE(${role ?? null}, role), status = COALESCE(${status ?? null}, status) WHERE id = ${u.id}`;
      // A role or status change takes effect immediately: the person is signed out everywhere.
      await prisma.$executeRaw`UPDATE public.auth_sessions SET revoked_at = now() WHERE user_id = ${u.id} AND revoked_at IS NULL`;
      auth.forgetSessions();
      await logAudit(prisma, {
        entity: 'user', entityId: u.id, action: 'update', ...actorOf(req),
        summary: `${u.username}: ${role ? `role ${u.role} → ${role}` : ''}${role && status ? ', ' : ''}${status ? `status ${u.status} → ${status}` : ''}`,
        before: { role: u.role, status: u.status }, after: { role: role ?? u.role, status: status ?? u.status },
      });
      return ok(res, { id: String(u.id), role: role ?? u.role, status: status ?? u.status });
    })
  );

  // A new temporary password. If the account came from a request, the person collects it on the status page like the first time;
  // otherwise it is shown once to the administrator.
  app.post(
    '/api/admin/users/:id/reset-password',
    asyncHandler(async (req, res) => {
      const u = await targetUser(req, res);
      if (!u) return null;
      const password = generatePassword();
      const hash = await hashPassword(password);
      await prisma.$executeRaw`
        UPDATE public.app_users SET password_hash = ${hash}, must_change_password = true, failed_attempts = 0, locked_until = NULL, password_changed_at = NULL WHERE id = ${u.id}`;
      await prisma.$executeRaw`UPDATE public.auth_sessions SET revoked_at = now() WHERE user_id = ${u.id} AND revoked_at IS NULL`;
      auth.forgetSessions();

      let delivered = 'admin';
      if (u.request_id) {
        const [r] = await prisma.$queryRaw`SELECT reference FROM public.access_requests WHERE id = ${u.request_id}`;
        if (r) {
          await prisma.$executeRaw`
            UPDATE public.access_requests
            SET credential_cipher = ${encryptSecret(password, r.reference)}, credential_expires_at = ${new Date(Date.now() + CREDENTIAL_DAYS * 86400000)}, credential_revealed_at = NULL
            WHERE id = ${u.request_id}`;
          delivered = 'status_page';
        }
      }
      await logAudit(prisma, { entity: 'user', entityId: u.id, action: 'password_reset', ...actorOf(req), summary: `Password reset for ${u.username} (${delivered === 'status_page' ? 'to be collected on the status page' : 'shown to the administrator'})` });
      return ok(res, delivered === 'admin' ? { delivered, password, username: u.username } : { delivered, username: u.username });
    })
  );

  app.post(
    '/api/admin/users/:id/revoke-sessions',
    asyncHandler(async (req, res) => {
      const u = await targetUser(req, res);
      if (!u) return null;
      const r = await prisma.$executeRaw`UPDATE public.auth_sessions SET revoked_at = now() WHERE user_id = ${u.id} AND revoked_at IS NULL`;
      auth.forgetSessions();
      await logAudit(prisma, { entity: 'user', entityId: u.id, action: 'sessions_revoked', ...actorOf(req), summary: `Signed ${u.username} out of ${r} session(s)` });
      return ok(res, { revoked: r });
    })
  );
};
