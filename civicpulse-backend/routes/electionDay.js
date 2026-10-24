/** Election day: slips printed, votes cast and turnout for every booth. */
const { logAudit } = require('../lib/audit');
const { actorOf } = require('../lib/authMiddleware');

module.exports = function registerElectionDay({ app, prisma, ok, fail, asyncHandler }) {
  async function load(partNo = null) {
    // partNo is always a Number here (never user text), so inlining it is safe.
    const rows = await prisma.$queryRawUnsafe(
      `SELECT b.part_no, b.polling_station_name, b.agent_name,
              (SELECT COUNT(*) FROM voterdb.electors e WHERE e.part_no = b.part_no)::int AS voters,
              COALESCE(s.slip_printed, 0)::int AS slip_printed,
              COALESCE(s.voted_count, 0)::int AS voted_count,
              s.updated_at
       FROM public.booths b
       LEFT JOIN public.election_day_stats s ON s.part_no = b.part_no
       ${partNo != null ? `WHERE b.part_no = ${Number(partNo)}` : 'WHERE EXISTS (SELECT 1 FROM voterdb.electors x WHERE x.part_no = b.part_no)'}
       ORDER BY b.part_no`
    );
    return rows.map((r) => {
      const voted = Math.min(r.voted_count, r.voters || r.voted_count);
      return {
        ...r,
        voted_count: voted,
        to_vote: Math.max(0, r.voters - voted),
        turnout_pct: r.voters ? Math.round((10000 * voted) / r.voters) / 100 : 0,
        slips_pending: Math.max(0, r.voters - r.slip_printed),
      };
    });
  }

  app.get(
    '/api/election-day',
    asyncHandler(async (_req, res) => {
      ok(res, await load());
    })
  );

  app.patch(
    '/api/election-day/:part',
    asyncHandler(async (req, res) => {
      const partNo = Number(req.params.part);
      const [current] = await load(partNo);
      if (!current) return fail(res, 404, 'Booth not found');

      const read = (v) => {
        if (v === undefined) return undefined;
        const n = Number(v);
        return Number.isInteger(n) && n >= 0 ? n : NaN;
      };
      const slip = read(req.body?.slip_printed);
      const voted = read(req.body?.voted_count);
      if (Number.isNaN(slip) || Number.isNaN(voted)) return fail(res, 400, 'Enter whole numbers, zero or more');

      const nextSlip = slip ?? current.slip_printed;
      let nextVoted = voted ?? current.voted_count;
      if (current.voters && nextVoted > current.voters) nextVoted = current.voters;
      const turnout = current.voters ? Math.round((10000 * nextVoted) / current.voters) / 100 : 0;

      await prisma.electionDayStats.upsert({
        where: { partNo },
        create: { partNo, slipPrinted: nextSlip, votedCount: nextVoted, missingCount: Math.max(0, current.voters - nextVoted), turnoutPct: turnout },
        update: { slipPrinted: nextSlip, votedCount: nextVoted, missingCount: Math.max(0, current.voters - nextVoted), turnoutPct: turnout },
      });
      const fresh = (await load(partNo))[0];
      await logAudit(prisma, {
        entity: 'election_day',
        entityId: partNo,
        action: 'update',
        ...actorOf(req),
        summary: `Booth ${partNo}: voted ${current.voted_count} → ${nextVoted}, slips ${current.slip_printed} → ${nextSlip}`,
        before: { voted_count: current.voted_count, slip_printed: current.slip_printed },
        after: { voted_count: nextVoted, slip_printed: nextSlip },
      });
      ok(res, fresh);
    })
  );
};
