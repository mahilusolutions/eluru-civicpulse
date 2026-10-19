/** Append-only history of who changed what. Rows are never updated or deleted. */
const { Prisma } = require('@prisma/client');

const json = (v) => JSON.stringify(v ?? null, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));

async function ensureAuditTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.audit_log (
      id          bigserial PRIMARY KEY,
      entity      text NOT NULL,
      entity_id   bigint,
      action      text NOT NULL,
      actor_role  text,
      summary     text,
      before_data jsonb,
      after_data  jsonb,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_log (entity, entity_id, created_at DESC)'
  );
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log (created_at DESC)');
}

/** action: create | update | delete. Never throws — a logging fault must not block the real change. */
async function logAudit(prisma, { entity, entityId, action, actorRole, summary, before, after }) {
  try {
    await prisma.$executeRaw`
      INSERT INTO public.audit_log (entity, entity_id, action, actor_role, summary, before_data, after_data)
      VALUES (${entity}, ${entityId != null ? BigInt(entityId) : null}, ${action}, ${actorRole || null}, ${summary || null},
              ${before == null ? null : json(before)}::jsonb, ${after == null ? null : json(after)}::jsonb)`;
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}

module.exports = { ensureAuditTable, logAudit, Prisma };
