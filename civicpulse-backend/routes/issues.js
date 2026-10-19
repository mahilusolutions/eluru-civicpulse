/** Issues: local problems reported by booth or ward, followed to resolution. */
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES = ['Open', 'In progress', 'Resolved', 'Closed'];
const toDbStatus = (s) => (s === 'In progress' ? 'In_progress' : s);

module.exports = function registerIssues({ app, prisma, ok, fail, asyncHandler }) {
  const include = {
    booth: { select: { pollingStationName: true } },
    ward: { select: { name: true, wardNo: true } },
  };

  const shape = (i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    part_no: i.partNo,
    ward_id: i.wardId,
    ward_no: i.ward?.wardNo ?? null,
    ward_name: i.ward?.name ?? null,
    booth_name: i.booth?.pollingStationName ?? null,
    priority: i.priority,
    status: i.status === 'In_progress' ? 'In progress' : i.status,
    reporter_role: i.reporterRole,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  });

  app.get(
    '/api/issues',
    asyncHandler(async (_req, res) => {
      const rows = await prisma.issue.findMany({ orderBy: { id: 'desc' }, include });
      ok(res, rows.map(shape));
    })
  );

  app.post(
    '/api/issues',
    asyncHandler(async (req, res) => {
      const { title, description, ward_id, part_no, priority, reporter_role } = req.body || {};
      const cleanTitle = String(title || '').trim().slice(0, 160);
      if (!cleanTitle) return fail(res, 400, 'Please describe the problem in the title');
      if (priority && !PRIORITIES.includes(priority)) return fail(res, 400, 'Invalid priority');
      const part = part_no ? Number(part_no) : null;
      if (part != null) {
        const booth = await prisma.booth.findUnique({ where: { partNo: part }, select: { partNo: true } });
        if (!booth) return fail(res, 400, `Booth ${part} does not exist`);
      }
      const row = await prisma.issue.create({
        data: {
          title: cleanTitle,
          description: String(description || '').trim().slice(0, 1000) || null,
          wardId: ward_id ? BigInt(ward_id) : null,
          partNo: part,
          priority: priority || 'Medium',
          reporterRole: reporter_role || null,
        },
        include,
      });
      ok(res, shape(row));
    })
  );

  app.patch(
    '/api/issues/:id',
    asyncHandler(async (req, res) => {
      const { status, priority, title, description } = req.body || {};
      const data = {};
      if (status !== undefined) {
        if (!STATUSES.includes(status)) return fail(res, 400, 'Invalid status');
        data.status = toDbStatus(status);
      }
      if (priority !== undefined) {
        if (!PRIORITIES.includes(priority)) return fail(res, 400, 'Invalid priority');
        data.priority = priority;
      }
      if (title !== undefined) {
        const t = String(title).trim().slice(0, 160);
        if (!t) return fail(res, 400, 'Title cannot be empty');
        data.title = t;
      }
      if (description !== undefined) data.description = String(description || '').trim().slice(0, 1000) || null;
      if (!Object.keys(data).length) return fail(res, 400, 'Nothing to update');
      const id = BigInt(req.params.id);
      if (!(await prisma.issue.findUnique({ where: { id } }))) return fail(res, 404, 'Issue not found');
      ok(res, shape(await prisma.issue.update({ where: { id }, data, include })));
    })
  );

  app.delete(
    '/api/issues/:id',
    asyncHandler(async (req, res) => {
      const id = BigInt(req.params.id);
      if (!(await prisma.issue.findUnique({ where: { id } }))) return fail(res, 404, 'Issue not found');
      await prisma.issue.delete({ where: { id } });
      ok(res, { id });
    })
  );
};
