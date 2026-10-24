/**
 * Team: the people with an account (coordinators, booth agents, volunteers ...) and the booths each one looks after.
 * It is read from the accounts themselves, so it can never drift from who can actually sign in. Accounts are created and
 * changed by the Super Admin (Accounts page); a booth's agent and coordinator are chosen in the booth window.
 */
const { ROLE_LABELS } = require('../lib/authStore');

module.exports = function registerTeam({ app, prisma, ok, asyncHandler }) {
  app.get(
    '/api/team',
    asyncHandler(async (_req, res) => {
      const [people, assigned] = await Promise.all([
        prisma.$queryRaw`
          SELECT u.id::text AS id, u.full_name, u.role, u.mobile, u.status, u.created_at, r.area
          FROM public.app_users u
          LEFT JOIN public.access_requests r ON r.id = u.request_id
          WHERE u.role <> 'super_admin'
          ORDER BY u.full_name`,
        prisma.$queryRaw`
          SELECT part_no, agent_user_id::text AS agent_id, coordinator_user_id::text AS coordinator_id
          FROM public.booths WHERE agent_user_id IS NOT NULL OR coordinator_user_id IS NOT NULL ORDER BY part_no`,
      ]);
      const parts = new Map();
      for (const b of assigned) {
        for (const id of [b.agent_id, b.coordinator_id]) {
          if (!id) continue;
          if (!parts.has(id)) parts.set(id, []);
          parts.get(id).push(b.part_no);
        }
      }
      ok(
        res,
        people.map((p) => ({
          id: p.id,
          name: p.full_name,
          role: ROLE_LABELS[p.role] || p.role,
          zone: p.area || null,
          phone: p.mobile || null,
          status: p.status === 'active' ? 'Active' : 'Inactive',
          assigned_parts: parts.get(p.id) || [],
          created_at: p.created_at,
        }))
      );
    })
  );
};
