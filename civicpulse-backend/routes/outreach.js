/** Outreach: every contact made with a voter (visit, call, WhatsApp, SMS, event). */
const TYPE_IN = {
  visit: 'door',
  door: 'door',
  call: 'phone',
  phone: 'phone',
  whatsapp: 'whatsapp',
  sms: 'sms',
  event: 'event',
  other: 'other',
};
const TYPE_OUT = {
  door: 'Visit',
  phone: 'Call',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  event: 'Event',
  other: 'Other',
};

module.exports = function registerOutreach({ app, prisma, Prisma, ok, fail, asyncHandler, houseFields }) {
  app.get(
    '/api/outreach',
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const offset = (page - 1) * limit;

      const conds = [Prisma.sql`TRUE`];
      const type = TYPE_IN[String(req.query.type || '').toLowerCase()];
      if (type) conds.push(Prisma.sql`o.type = ${type}::public.outreach_type`);
      if (req.query.outcome && req.query.outcome !== 'all') conds.push(Prisma.sql`o.outcome = ${String(req.query.outcome)}`);
      if (req.query.part && req.query.part !== 'all' && Number.isFinite(Number(req.query.part))) {
        conds.push(Prisma.sql`e.part_no = ${Number(req.query.part)}`);
      }
      if (req.query.voter_id && Number.isFinite(Number(req.query.voter_id))) {
        conds.push(Prisma.sql`o.elector_id = ${BigInt(req.query.voter_id)}`);
      }
      const days = Number(req.query.days);
      if (Number.isFinite(days) && days > 0) conds.push(Prisma.sql`o.created_at >= now() - (${days} * interval '1 day')`);
      const q = String(req.query.q || '').trim();
      if (q) {
        const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        conds.push(Prisma.sql`(e.name ILIKE ${like} OR o.notes ILIKE ${like} OR o.outcome ILIKE ${like} OR e.house_no ILIKE ${like})`);
      }
      const where = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`;

      const [rows, count] = await Promise.all([
        prisma.$queryRaw`
          SELECT o.id, o.type::text AS type, o.outcome, o.notes, o.created_by_role, o.created_at,
                 e.id AS voter_id, e.name AS voter_name, e.part_no, e.house_no, e.section_name
          FROM public.outreach o JOIN voterdb.electors e ON e.id = o.elector_id
          ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ${limit} OFFSET ${offset}`,
        prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM public.outreach o JOIN voterdb.electors e ON e.id = o.elector_id ${where}`,
      ]);

      ok(res, {
        rows: rows.map((r) => ({ ...r, type: TYPE_OUT[r.type] || r.type, ...houseFields(r.house_no) })),
        total: count[0].n,
        page,
        page_size: limit,
      });
    })
  );

  app.get(
    '/api/outreach/stats',
    asyncHandler(async (_req, res) => {
      const [totals, byType, byOutcome, perDay, voters] = await Promise.all([
        prisma.$queryRaw`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
                 COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS last7,
                 COUNT(DISTINCT elector_id)::int AS voters_contacted
          FROM public.outreach`,
        prisma.$queryRaw`SELECT type::text AS key, COUNT(*)::int AS count FROM public.outreach GROUP BY 1 ORDER BY 2 DESC`,
        prisma.$queryRaw`SELECT COALESCE(outcome, 'No result noted') AS key, COUNT(*)::int AS count FROM public.outreach GROUP BY 1 ORDER BY 2 DESC`,
        prisma.$queryRaw`
          SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(c.n, 0)::int AS count
          FROM generate_series(current_date - 13, current_date, interval '1 day') d
          LEFT JOIN (SELECT created_at::date AS day, COUNT(*) AS n FROM public.outreach GROUP BY 1) c ON c.day = d::date
          ORDER BY d`,
        prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM voterdb.electors`,
      ]);
      ok(res, {
        ...totals[0],
        total_voters: voters[0].n,
        by_type: byType.map((r) => ({ ...r, key: TYPE_OUT[r.key] || r.key })),
        by_outcome: byOutcome,
        per_day: perDay,
      });
    })
  );

  app.post(
    '/api/outreach',
    asyncHandler(async (req, res) => {
      const { voter_id, type, outcome, notes, created_by_role } = req.body || {};
      if (!voter_id || !type) return fail(res, 400, 'Choose a voter and how you reached them');
      const mapped = TYPE_IN[String(type).toLowerCase()];
      if (!mapped) return fail(res, 400, 'Invalid type');
      const id = BigInt(voter_id);
      const voter = await prisma.elector.findUnique({ where: { id }, select: { status: true } });
      if (!voter) return fail(res, 404, 'Voter not found');

      const row = await prisma.outreach.create({
        data: {
          electorId: id,
          type: mapped,
          outcome: outcome ? String(outcome).slice(0, 80) : null,
          notes: notes ? String(notes).slice(0, 500) : null,
          createdByRole: created_by_role || null,
        },
      });

      // A real conversation moves the voter on from "not contacted".
      if (voter.status === 'active' && !/not home/i.test(outcome || '')) {
        await prisma.elector.update({
          where: { id },
          data: { status: /call back/i.test(outcome || '') ? 'callback' : 'visited' },
        });
      }
      ok(res, { ...row, type: TYPE_OUT[row.type] || row.type });
    })
  );
};
