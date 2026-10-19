/** Registers every page's API routes. */
module.exports = function registerRoutes(ctx) {
  require('./dashboard')(ctx);
  require('./wards')(ctx);
  require('./households')(ctx);
  require('./outreach')(ctx);
  require('./issues')(ctx);
  require('./surveys')(ctx);
  require('./electionDay')(ctx);
  require('./team')(ctx);
  require('./reports')(ctx);

  // The map uses the same booth figures as the Booths page (with coordinates).
  ctx.app.get(
    '/api/map/booths',
    ctx.asyncHandler(async (_req, res) => {
      ctx.ok(res, await ctx.loadBoothSummaries());
    })
  );
};
