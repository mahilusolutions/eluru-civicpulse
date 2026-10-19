/** Households: voters grouped by (booth, house number). */
module.exports = function registerHouseholds({ app, prisma, Prisma, ok, asyncHandler, houseFields }) {
  const ORDERS = {
    house: Prisma.raw('part_no ASC, house_no ASC'),
    members: Prisma.raw('members DESC, part_no ASC, house_no ASC'),
    seniors: Prisma.raw('seniors DESC, members DESC, part_no ASC, house_no ASC'),
  };

  app.get(
    '/api/households',
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const offset = (page - 1) * limit;

      const conds = [Prisma.sql`house_no IS NOT NULL AND house_no <> ''`];
      if (req.query.part && req.query.part !== 'all' && Number.isFinite(Number(req.query.part))) {
        conds.push(Prisma.sql`part_no = ${Number(req.query.part)}`);
      }
      if (req.query.section && req.query.section !== 'all' && Number.isFinite(Number(req.query.section))) {
        conds.push(Prisma.sql`section_no = ${Number(req.query.section)}`);
      }
      const q = String(req.query.q || '').trim();
      const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const having = q
        ? Prisma.sql`HAVING bool_or(name ILIKE ${like} OR house_no ILIKE ${like} OR relation_name ILIKE ${like})`
        : Prisma.empty;

      const size = String(req.query.size || 'all');
      const sizeWhere =
        size === '5+'
          ? Prisma.sql`WHERE members >= 5`
          : ['1', '2', '3', '4'].includes(size)
            ? Prisma.sql`WHERE members = ${Number(size)}`
            : Prisma.empty;
      const order = ORDERS[req.query.sort] || ORDERS.house;

      const grouped = Prisma.sql`
        SELECT part_no, house_no,
               COUNT(*)::int AS members,
               MIN(section_no)::int AS section_no,
               MIN(section_name) AS road,
               COUNT(*) FILTER (WHERE gender = 'M'::voterdb.gender_code)::int AS men,
               COUNT(*) FILTER (WHERE gender = 'F'::voterdb.gender_code)::int AS women,
               COUNT(*) FILTER (WHERE age >= 60)::int AS seniors,
               MAX(age)::int AS eldest_age,
               (array_agg(name ORDER BY age DESC NULLS LAST, serial_no))[1] AS eldest_name
        FROM voterdb.electors
        WHERE ${Prisma.join(conds, ' AND ')}
        GROUP BY part_no, house_no
        ${having}`;

      const [rows, totals, sizes] = await Promise.all([
        prisma.$queryRaw`WITH g AS (${grouped}) SELECT * FROM g ${sizeWhere} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
        prisma.$queryRaw`
          WITH g AS (${grouped})
          SELECT COUNT(*)::int AS households, COALESCE(SUM(members), 0)::int AS voters,
                 COALESCE(ROUND(AVG(members), 1), 0)::float AS avg_size,
                 COUNT(*) FILTER (WHERE seniors > 0)::int AS with_seniors,
                 (SELECT COUNT(*)::int FROM g ${sizeWhere}) AS matching
          FROM g`,
        prisma.$queryRaw`
          WITH g AS (${grouped})
          SELECT LEAST(members, 5)::int AS size, COUNT(*)::int AS count FROM g GROUP BY 1 ORDER BY 1`,
      ]);

      ok(res, {
        rows: rows.map((r) => ({ ...r, ...houseFields(r.house_no) })),
        total: totals[0].matching,
        page,
        page_size: limit,
        stats: { ...totals[0], sizes },
      });
    })
  );

  /** Everyone living in one household. */
  app.get(
    '/api/households/members',
    asyncHandler(async (req, res) => {
      const part = Number(req.query.part);
      const house = String(req.query.house || '');
      if (!Number.isFinite(part) || !house) return ok(res, []);
      const rows = await prisma.$queryRaw`
        SELECT id, serial_no, name, age, gender::text AS gender, relation_type::text AS relation_type,
               relation_name, epic, section_name, status::text AS status
        FROM voterdb.electors
        WHERE part_no = ${part} AND house_no = ${house}
        ORDER BY age DESC NULLS LAST, serial_no`;
      ok(res, rows);
    })
  );
};
