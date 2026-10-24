/** Dashboard: the numbers that matter today, in one request. */
module.exports = function registerDashboard({ app, prisma, ok, asyncHandler, loadBoothSummaries }) {
  app.get(
    '/api/dashboard/summary',
    asyncHandler(async (_req, res) => {
      const [booths, issuesOpen, issuesCritical, outreach, team, files, recentOutreach, recentIssues] = await Promise.all([
        loadBoothSummaries(),
        prisma.issue.count({ where: { NOT: { status: { in: ['Resolved', 'Closed'] } } } }),
        prisma.issue.count({ where: { priority: { in: ['High', 'Critical'] }, NOT: { status: { in: ['Resolved', 'Closed'] } } } }),
        prisma.$queryRaw`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
                 COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS last7
          FROM public.outreach`,
        prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM public.app_users WHERE role <> 'super_admin' AND status = 'active'`.then((r) => r[0].n),
        prisma.rollFile.count(),
        prisma.$queryRaw`
          SELECT o.id, o.type::text AS type, o.outcome, o.created_at, e.name AS voter_name, e.part_no
          FROM public.outreach o JOIN voterdb.electors e ON e.id = o.elector_id
          ORDER BY o.created_at DESC, o.id DESC LIMIT 6`,
        prisma.issue.findMany({
          orderBy: { id: 'desc' },
          take: 6,
          select: { id: true, title: true, priority: true, status: true, partNo: true, createdAt: true },
        }),
      ]);

      const sum = (key) => booths.reduce((n, b) => n + (b[key] || 0), 0);
      const voters = sum('voters');
      const reached = sum('reached');
      const totals = {
        booths: booths.length,
        voters,
        households: sum('households'),
        reached,
        reach_pct: voters ? Math.round((100 * reached) / voters) : 0,
        with_epic: sum('with_epic'),
        male: sum('male'),
        female: sum('female'),
        booths_without_agent: booths.filter((b) => !b.agent_name).length,
        booths_complete: booths.filter((b) => b.status === 'complete').length,
        issues_open: issuesOpen,
        issues_urgent: issuesCritical,
        outreach_total: outreach[0].total,
        outreach_today: outreach[0].today,
        outreach_week: outreach[0].last7,
        team,
        files,
      };

      ok(res, {
        totals,
        booths: booths.map((b) => ({
          part_no: b.part_no,
          polling_station_name: b.polling_station_name,
          voters: b.voters,
          reached: b.reached,
          agent_name: b.agent_name,
          status: b.status,
          lat: b.lat,
          lng: b.lng,
        })),
        recent_outreach: recentOutreach,
        recent_issues: recentIssues,
        // kept for older screens
        stats: [
          { label: 'Booth parts', value: String(totals.booths), hint: 'Parts with rolls loaded' },
          { label: 'Voters', value: String(totals.voters), hint: 'People on the voter list' },
          { label: 'Avg coverage', value: `${totals.reach_pct}%`, hint: 'Voters reached' },
          { label: 'Open issues', value: String(issuesOpen), hint: 'Problems still open' },
        ],
        files,
        topBooths: [...booths].sort((a, b) => b.voters - a.voters).slice(0, 8),
        recentIssues,
      });
    })
  );
};
