/** Tables for sign-in: accounts, sessions and access requests. Created automatically at start-up. */

const ROLES = ['super_admin', 'admin', 'coordinator', 'booth_agent', 'volunteer', 'viewer'];
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  coordinator: 'Coordinator',
  booth_agent: 'Booth Agent',
  volunteer: 'Volunteer',
  viewer: 'Viewer',
};
// Roles a person may ask for. Super Admin is never requestable.
const REQUESTABLE_ROLES = ['admin', 'coordinator', 'booth_agent', 'volunteer', 'viewer'];

async function ensureAuthTables(prisma) {
  const steps = [
    `CREATE TABLE IF NOT EXISTS public.app_users (
       id                   bigserial PRIMARY KEY,
       username             text NOT NULL,
       full_name            text NOT NULL,
       mobile               text,
       email                text,
       role                 text NOT NULL,
       password_hash        text NOT NULL,
       must_change_password boolean NOT NULL DEFAULT true,
       status               text NOT NULL DEFAULT 'active',
       failed_attempts      int NOT NULL DEFAULT 0,
       locked_until         timestamptz,
       last_login_at        timestamptz,
       password_changed_at  timestamptz,
       created_at           timestamptz NOT NULL DEFAULT now(),
       created_by           bigint,
       request_id           bigint
     )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_username ON public.app_users (lower(username))',
    'CREATE INDEX IF NOT EXISTS idx_app_users_mobile ON public.app_users (mobile)',

    `CREATE TABLE IF NOT EXISTS public.auth_sessions (
       id           bigserial PRIMARY KEY,
       user_id      bigint NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
       token_hash   text NOT NULL UNIQUE,
       created_at   timestamptz NOT NULL DEFAULT now(),
       last_seen_at timestamptz NOT NULL DEFAULT now(),
       expires_at   timestamptz NOT NULL,
       ip           text,
       user_agent   text,
       revoked_at   timestamptz
     )`,
    'CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON public.auth_sessions (user_id)',
    'CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON public.auth_sessions (expires_at)',

    `CREATE TABLE IF NOT EXISTS public.access_requests (
       id                     bigserial PRIMARY KEY,
       reference              text NOT NULL UNIQUE,
       full_name              text NOT NULL,
       mobile                 text NOT NULL,
       email                  text,
       designation            text NOT NULL,
       area                   text NOT NULL,
       requested_role         text NOT NULL,
       voter_id               text,
       reason                 text NOT NULL,
       referred_by            text,
       status                 text NOT NULL DEFAULT 'pending',
       admin_note             text,
       decided_by             bigint,
       decided_at             timestamptz,
       user_id                bigint,
       credential_cipher      text,
       credential_expires_at  timestamptz,
       credential_revealed_at timestamptz,
       status_attempts        int NOT NULL DEFAULT 0,
       status_locked_until    timestamptz,
       ip                     text,
       user_agent             text,
       created_at             timestamptz NOT NULL DEFAULT now()
     )`,
    'CREATE INDEX IF NOT EXISTS idx_access_requests_status ON public.access_requests (status, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_access_requests_mobile ON public.access_requests (mobile)',
    'ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS actor_user text',
  ];
  for (const sql of steps) await prisma.$executeRawUnsafe(sql);
}

/** Normalises an Indian mobile number to 10 digits (6-9 first). Returns null when it is not valid. */
function normalizeMobile(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 && /^[6-9]/.test(d) ? d : null;
}

module.exports = { ensureAuthTables, normalizeMobile, ROLES, ROLE_LABELS, REQUESTABLE_ROLES };
