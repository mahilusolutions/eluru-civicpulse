/** Wards: groups of booths. A booth belongs to at most one ward. */
module.exports = function registerWards({ app, prisma, ok, fail, asyncHandler }) {
  async function loadWards(where) {
    const wards = await prisma.ward.findMany({
      where,
      orderBy: { wardNo: 'asc' },
      include: {
        wardBooths: {
          orderBy: { partNo: 'asc' },
          include: {
            booth: { select: { pollingStationName: true, voterCount: true, agentName: true } },
          },
        },
      },
    });
    return wards.map((w) => {
      const booths = w.wardBooths.map((x) => ({
        part_no: x.partNo,
        polling_station_name: x.booth?.pollingStationName || null,
        voters: x.booth?.voterCount || 0,
        agent_name: x.booth?.agentName || null,
      }));
      return {
        id: w.id,
        ward_no: w.wardNo,
        name: w.name,
        notes: w.notes,
        parts: booths.map((b) => b.part_no),
        booths,
        booth_count: booths.length,
        voters: booths.reduce((sum, b) => sum + b.voters, 0),
      };
    });
  }

  function readBody(body = {}) {
    const wardNo = Number(body.ward_no);
    if (!Number.isInteger(wardNo) || wardNo < 1 || wardNo > 999) return { error: 'Ward number must be between 1 and 999' };
    const name = String(body.name || '').trim().slice(0, 120);
    if (!name) return { error: 'Ward name is required' };
    const notes = String(body.notes || '').trim().slice(0, 500) || null;
    const parts = [...new Set((Array.isArray(body.parts) ? body.parts : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
    return { wardNo, name, notes, parts };
  }

  /** Put exactly these booths in the ward (taking them out of any other ward). */
  async function assignBooths(tx, wardId, parts) {
    if (parts.length) {
      const found = await tx.booth.count({ where: { partNo: { in: parts } } });
      if (found !== parts.length) throw Object.assign(new Error('One of the selected booths does not exist'), { status: 400 });
      await tx.wardBooth.deleteMany({ where: { partNo: { in: parts }, NOT: { wardId } } });
    }
    await tx.wardBooth.deleteMany({ where: { wardId } });
    await tx.booth.updateMany({ where: { wardId }, data: { wardId: null } });
    if (parts.length) {
      await tx.wardBooth.createMany({ data: parts.map((partNo) => ({ wardId, partNo })) });
      await tx.booth.updateMany({ where: { partNo: { in: parts } }, data: { wardId } });
    }
  }

  function friendly(err, res) {
    if (err?.code === 'P2002') return fail(res, 409, 'That ward number is already used');
    if (err?.status) return fail(res, err.status, err.message);
    throw err;
  }

  app.get(
    '/api/wards',
    asyncHandler(async (_req, res) => {
      ok(res, await loadWards());
    })
  );

  app.post(
    '/api/wards',
    asyncHandler(async (req, res) => {
      const body = readBody(req.body);
      if (body.error) return fail(res, 400, body.error);
      try {
        const id = await prisma.$transaction(async (tx) => {
          const ward = await tx.ward.create({ data: { wardNo: body.wardNo, name: body.name, notes: body.notes } });
          await assignBooths(tx, ward.id, body.parts);
          return ward.id;
        });
        ok(res, (await loadWards({ id }))[0]);
      } catch (err) {
        friendly(err, res);
      }
    })
  );

  app.patch(
    '/api/wards/:id',
    asyncHandler(async (req, res) => {
      const id = BigInt(req.params.id);
      const existing = await prisma.ward.findUnique({ where: { id } });
      if (!existing) return fail(res, 404, 'Ward not found');
      const body = readBody(req.body);
      if (body.error) return fail(res, 400, body.error);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.ward.update({ where: { id }, data: { wardNo: body.wardNo, name: body.name, notes: body.notes } });
          await assignBooths(tx, id, body.parts);
        });
        ok(res, (await loadWards({ id }))[0]);
      } catch (err) {
        friendly(err, res);
      }
    })
  );

  app.delete(
    '/api/wards/:id',
    asyncHandler(async (req, res) => {
      const id = BigInt(req.params.id);
      const existing = await prisma.ward.findUnique({ where: { id } });
      if (!existing) return fail(res, 404, 'Ward not found');
      await prisma.$transaction(async (tx) => {
        await tx.booth.updateMany({ where: { wardId: id }, data: { wardId: null } });
        await tx.ward.delete({ where: { id } });
      });
      ok(res, { id });
    })
  );
};
