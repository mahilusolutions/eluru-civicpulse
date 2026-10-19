/** Team: coordinators, booth agents and volunteers. */
module.exports = function registerTeam({ app, prisma, ok, fail, asyncHandler }) {
  const shape = (r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    zone: r.zone,
    phone: r.phone,
    status: r.status,
    assigned_parts: r.assignedParts || [],
    created_at: r.createdAt,
  });

  function readBody(b = {}, partial = false) {
    const out = {};
    if (!partial || b.name !== undefined) {
      const name = String(b.name || '').trim().slice(0, 120);
      if (!name) return { error: 'Name is required' };
      out.name = name;
    }
    if (!partial || b.role !== undefined) {
      const role = String(b.role || '').trim().slice(0, 60);
      if (!role) return { error: 'Role is required' };
      out.role = role;
    }
    if (b.zone !== undefined) out.zone = String(b.zone || '').trim().slice(0, 120) || null;
    if (b.status !== undefined) {
      if (!['Active', 'Inactive'].includes(b.status)) return { error: 'Invalid status' };
      out.status = b.status;
    }
    if (b.phone !== undefined) {
      const phone = String(b.phone || '').replace(/[^\d+]/g, '');
      if (phone && (phone.length < 7 || phone.length > 15)) return { error: 'Enter a valid phone number' };
      out.phone = phone || null;
    }
    if (b.assigned_parts !== undefined) {
      out.assignedParts = [...new Set((Array.isArray(b.assigned_parts) ? b.assigned_parts : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
    }
    return { data: out };
  }

  app.get(
    '/api/team',
    asyncHandler(async (_req, res) => {
      ok(res, (await prisma.teamMember.findMany({ orderBy: { id: 'asc' } })).map(shape));
    })
  );

  app.post(
    '/api/team',
    asyncHandler(async (req, res) => {
      const parsed = readBody(req.body);
      if (parsed.error) return fail(res, 400, parsed.error);
      ok(res, shape(await prisma.teamMember.create({ data: { status: 'Active', ...parsed.data } })));
    })
  );

  app.patch(
    '/api/team/:id',
    asyncHandler(async (req, res) => {
      const id = BigInt(req.params.id);
      if (!(await prisma.teamMember.findUnique({ where: { id } }))) return fail(res, 404, 'Team member not found');
      const parsed = readBody(req.body, true);
      if (parsed.error) return fail(res, 400, parsed.error);
      if (!Object.keys(parsed.data).length) return fail(res, 400, 'Nothing to update');
      ok(res, shape(await prisma.teamMember.update({ where: { id }, data: parsed.data })));
    })
  );

  app.delete(
    '/api/team/:id',
    asyncHandler(async (req, res) => {
      const id = BigInt(req.params.id);
      if (!(await prisma.teamMember.findUnique({ where: { id } }))) return fail(res, 404, 'Team member not found');
      await prisma.teamMember.delete({ where: { id } });
      ok(res, { id });
    })
  );
};
