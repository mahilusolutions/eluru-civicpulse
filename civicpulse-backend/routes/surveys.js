/** Surveys: one question, many short answers collected in the field. */
module.exports = function registerSurveys({ app, prisma, ok, fail, asyncHandler }) {
  app.get(
    '/api/surveys',
    asyncHandler(async (_req, res) => {
      const [surveys, answers] = await Promise.all([
        prisma.survey.findMany({
          orderBy: { id: 'desc' },
          include: {
            _count: { select: { responses: true } },
            responses: { orderBy: { id: 'desc' }, take: 500 },
          },
        }),
        // Same answer typed in different cases/spaces counts once.
        prisma.$queryRaw`
          SELECT survey_id, lower(trim(answer)) AS key, (array_agg(answer ORDER BY id DESC))[1] AS label, COUNT(*)::int AS count
          FROM public.survey_responses GROUP BY 1, 2 ORDER BY survey_id, count DESC, key`,
      ]);
      ok(
        res,
        surveys.map((s) => ({
          id: s.id,
          title: s.title,
          question: s.question,
          created_at: s.createdAt,
          response_count: s._count.responses,
          responses: s.responses.map((r) => ({
            id: r.id,
            answer: r.answer,
            part_no: r.partNo,
            respondent_name: r.respondentName,
            created_by_role: r.createdByRole,
            created_at: r.createdAt,
          })),
          answers: answers.filter((a) => String(a.survey_id) === String(s.id)).map(({ key, label, count }) => ({ key, label, count })),
        }))
      );
    })
  );

  app.post(
    '/api/surveys',
    asyncHandler(async (req, res) => {
      const title = String(req.body?.title || '').trim().slice(0, 120);
      const question = String(req.body?.question || '').trim().slice(0, 300);
      if (!title || !question) return fail(res, 400, 'Give the survey a name and a question');
      ok(res, await prisma.survey.create({ data: { title, question } }));
    })
  );

  app.delete(
    '/api/surveys/:id',
    asyncHandler(async (req, res) => {
      const id = BigInt(req.params.id);
      if (!(await prisma.survey.findUnique({ where: { id } }))) return fail(res, 404, 'Survey not found');
      await prisma.survey.delete({ where: { id } });
      ok(res, { id });
    })
  );

  app.post(
    '/api/surveys/:id/responses',
    asyncHandler(async (req, res) => {
      const { answer, part_no, respondent_name, created_by_role } = req.body || {};
      const text = String(answer || '').trim().slice(0, 300);
      if (!text) return fail(res, 400, 'Please enter an answer');
      const surveyId = BigInt(req.params.id);
      if (!(await prisma.survey.findUnique({ where: { id: surveyId } }))) return fail(res, 404, 'Survey not found');
      const part = part_no ? Number(part_no) : null;
      if (part != null && !(await prisma.booth.findUnique({ where: { partNo: part }, select: { partNo: true } }))) {
        return fail(res, 400, `Booth ${part} does not exist`);
      }
      ok(
        res,
        await prisma.surveyResponse.create({
          data: {
            surveyId,
            partNo: part,
            answer: text,
            respondentName: String(respondent_name || '').trim().slice(0, 120) || null,
            createdByRole: created_by_role || null,
          },
        })
      );
    })
  );
};
