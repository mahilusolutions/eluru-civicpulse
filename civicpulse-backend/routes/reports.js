/** Reports: spreadsheet (CSV) downloads for meetings and sharing. */
const cell = (v) => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const toCsv = (head, rows) => [head.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n');

module.exports = function registerReports({ app, prisma, ok, fail, asyncHandler, loadBoothSummaries, houseFields }) {
  const stationOf = (b) =>
    String(b.polling_station_name || '')
      .replace(/^\s*\d+\s*[-–]\s*/, '')
      .replace(/\s+,/g, ',')
      .trim();

  const REPORTS = {
    voters: async () => {
      const rows = await prisma.$queryRaw`
        SELECT part_no, serial_no, epic, name, relation_type::text AS relation_type, relation_name, house_no, age,
               gender::text AS gender, section_name, status::text AS status, support_lean::text AS support_lean, phone
        FROM voterdb.electors ORDER BY part_no, serial_no LIMIT 60000`;
      return {
        head: ['Booth', 'Voter no.', 'Voter ID', 'Name', 'Relation', 'Relative name', 'House number', 'Address note', 'Age', 'Gender', 'Road', 'Status', 'Support', 'Phone'],
        rows: rows.map((r) => {
          const h = houseFields(r.house_no);
          return [r.part_no, r.serial_no, r.epic, r.name, r.relation_type, r.relation_name, h.house_number, h.address_note, r.age, r.gender, r.section_name, r.status, r.support_lean, r.phone];
        }),
      };
    },
    booths: async () => {
      const booths = await loadBoothSummaries();
      return {
        head: ['Booth', 'Polling station', 'Address', 'Ward', 'Voters', 'Men', 'Women', 'Households', 'Roads', 'Voters reached', 'Reached %', 'Booth agent', 'Coordinator', 'Status'],
        rows: booths.map((b) => [b.part_no, stationOf(b), b.polling_station_address, b.ward_name, b.voters, b.male, b.female, b.households, b.roads, b.reached, b.coverage_pct, b.agent_name, b.coordinator_name, b.status]),
      };
    },
    households: async () => {
      const rows = await prisma.$queryRaw`
        SELECT part_no, house_no, COUNT(*)::int AS members, MIN(section_name) AS road,
               (array_agg(name ORDER BY age DESC NULLS LAST, serial_no))[1] AS eldest_name
        FROM voterdb.electors WHERE house_no IS NOT NULL AND house_no <> ''
        GROUP BY part_no, house_no ORDER BY part_no, house_no`;
      return {
        head: ['Booth', 'House number', 'Address note', 'Road', 'Members', 'Eldest member'],
        rows: rows.map((r) => {
          const h = houseFields(r.house_no);
          return [r.part_no, h.house_number, h.address_note, r.road, r.members, r.eldest_name];
        }),
      };
    },
    issues: async () => {
      const rows = await prisma.issue.findMany({ orderBy: { id: 'desc' }, include: { booth: { select: { pollingStationName: true } }, ward: { select: { name: true } } } });
      return {
        head: ['Issue', 'Details', 'Booth', 'Ward', 'Priority', 'Status', 'Reported by', 'Reported on'],
        rows: rows.map((i) => [i.title, i.description, i.partNo, i.ward?.name, i.priority, i.status === 'In_progress' ? 'In progress' : i.status, i.reporterRole, i.createdAt.toISOString().slice(0, 10)]),
      };
    },
    outreach: async () => {
      const rows = await prisma.$queryRaw`
        SELECT o.created_at, e.part_no, e.name, e.house_no, o.type::text AS type, o.outcome, o.notes, o.created_by_role
        FROM public.outreach o JOIN voterdb.electors e ON e.id = o.elector_id ORDER BY o.created_at DESC LIMIT 60000`;
      const label = { door: 'Visit', phone: 'Call', whatsapp: 'WhatsApp', sms: 'SMS', event: 'Event', other: 'Other' };
      return {
        head: ['Date', 'Booth', 'Voter', 'House', 'How', 'Result', 'Notes', 'Logged by'],
        rows: rows.map((r) => [new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' '), r.part_no, r.name, r.house_no, label[r.type] || r.type, r.outcome, r.notes, r.created_by_role]),
      };
    },
    team: async () => {
      const rows = await prisma.teamMember.findMany({ orderBy: { id: 'asc' } });
      return {
        head: ['Name', 'Role', 'Zone', 'Phone', 'Status', 'Booths'],
        rows: rows.map((m) => [m.name, m.role, m.zone, m.phone, m.status, (m.assignedParts || []).join(' ')]),
      };
    },
  };

  app.get(
    '/api/reports',
    asyncHandler(async (_req, res) => {
      const [voters, booths, households, issues, outreach, team] = await Promise.all([
        prisma.elector.count(),
        prisma.$queryRaw`SELECT COUNT(DISTINCT part_no)::int AS n FROM voterdb.electors`.then((r) => r[0].n),
        prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM (SELECT 1 FROM voterdb.electors WHERE house_no IS NOT NULL AND house_no <> '' GROUP BY part_no, house_no) g`,
        prisma.issue.count(),
        prisma.outreach.count(),
        prisma.teamMember.count(),
      ]);
      ok(res, { voters, booths, households: households[0].n, issues, outreach, team });
    })
  );

  app.get(
    '/api/reports/:type',
    asyncHandler(async (req, res) => {
      const build = REPORTS[req.params.type];
      if (!build) return fail(res, 404, 'Unknown report');
      const { head, rows } = await build();
      ok(res, { count: rows.length, csv: toCsv(head, rows) });
    })
  );
};
