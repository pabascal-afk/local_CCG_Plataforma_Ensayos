const { prisma } = require('../lib/prisma');
const { computeResults } = require('./grading');

/**
 * Momento límite de un intento: el menor entre (inicio + duración) y el cierre de la asignación
 * (o plazo individual extendido si el estudiante fue reactivado).
 */
function getDeadline(submission, assignment, exam) {
  const effectiveCloses = submission?.extendedDeadline
    ? new Date(submission.extendedDeadline).getTime()
    : new Date(assignment.closesAt).getTime();

  if (!exam.durationMinutes) return new Date(effectiveCloses);
  const byDuration = new Date(submission.startedAt).getTime() + exam.durationMinutes * 60 * 1000;
  return new Date(Math.min(effectiveCloses, byDuration));
}

/**
 * Corrige y cierra un intento. Idempotente: si ya estaba entregado, lo devuelve sin cambios.
 */
async function finalizeSubmission(submissionId, { auto = false } = {}) {
  return prisma.$transaction(async (tx) => {
    const submission = await tx.submission.findUnique({
      where: { id: submissionId },
      include: {
        answers: true,
        assignment: { include: { exam: { include: { questions: true } } } },
      },
    });
    if (!submission) throw new Error('Intento no encontrado');
    if (submission.status === 'SUBMITTED') return submission;

    const exam = submission.assignment.exam;
    const answersMap = {};
    const awardedPointsMap = {};
    for (const a of submission.answers) {
      answersMap[a.questionId] = a.selectedAnswer;
      if (a.awardedPoints !== null && a.awardedPoints !== undefined) {
        awardedPointsMap[a.questionId] = a.awardedPoints;
      }
    }

    const results = computeResults(exam.questions, answersMap, exam, awardedPointsMap);

    for (const pq of results.perQuestion) {
      if (pq.selected === null && pq.awardedPoints === null) continue;
      await tx.submissionAnswer.updateMany({
        where: { submissionId, questionId: pq.questionId },
        data: { isCorrect: pq.isCorrect },
      });
    }

    return tx.submission.update({
      where: { id: submissionId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        autoSubmitted: auto,
        correctCount: results.correctCount,
        percent: results.percent,
        grade: results.grade,
        achievementLevel: results.achievementLevel,
        simceScore: results.simceScore,
        theta: results.theta,
        seTheta: results.seTheta,
      },
    });
  });
}

/**
 * Entrega automáticamente los intentos cuyo tiempo venció (alumno cerró el navegador, etc.).
 */
async function sweepExpiredSubmissions() {
  const open = await prisma.submission.findMany({
    where: { status: 'IN_PROGRESS' },
    include: { assignment: { include: { exam: true } } },
  });
  const now = Date.now();
  let count = 0;
  for (const s of open) {
    const deadline = getDeadline(s, s.assignment, s.assignment.exam).getTime();
    // 30 s de gracia para el último autoguardado
    if (now > deadline + 30 * 1000) {
      await finalizeSubmission(s.id, { auto: true });
      count += 1;
    }
  }
  return count;
}

module.exports = { getDeadline, finalizeSubmission, sweepExpiredSubmissions };
