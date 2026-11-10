const { prisma } = require('../lib/prisma');
const { computeResults, isOpenQuestion, normalizeGradingMode, normalizePassThreshold } = require('./grading');
const { logAssignmentAction } = require('./assignmentLog');

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

function nearlyEqual(a, b, eps = 1e-9) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return Math.abs(Number(a) - Number(b)) < eps;
}

function roundAvg(sum, count) {
  if (!count) return null;
  return Math.round((sum / count) * 100) / 100;
}

function formatCourseLabel(course) {
  if (!course) return 'Sin curso';
  const lvl = String(course.level || '').replace('B', '° Básico').replace('M', '° Medio');
  return `${lvl} ${course.letter || ''} (${course.year || ''})`.trim();
}

/**
 * Reevalúa todas las entregas finalizadas (status = 'SUBMITTED') de una evaluación
 * usando la pauta actual (preguntas, claves, puntajes, tipos y parámetros TRI/SIMCE).
 * Mantiene intactos los intentos IN_PROGRESS y conserva el puntaje manual asignado a
 * preguntas abiertas (WRITTEN / ORAL).
 */
async function recalculateExamSubmissions(examId, { assignmentId = null, actor = null, note = null } = {}) {
  const parsedExamId = parseInt(examId, 10);
  if (isNaN(parsedExamId)) {
    return { badRequest: true, error: 'ID de evaluación inválido' };
  }

  let parsedAssignmentId = null;
  if (assignmentId !== null && assignmentId !== undefined && assignmentId !== '') {
    parsedAssignmentId = parseInt(assignmentId, 10);
    if (isNaN(parsedAssignmentId)) {
      return { badRequest: true, error: 'ID de asignación inválido' };
    }
  }

  const exam = await prisma.exam.findUnique({
    where: { id: parsedExamId },
    include: {
      questions: { orderBy: { questionNumber: 'asc' } },
      assignments: { select: { id: true, courseId: true } },
    },
  });

  if (!exam) {
    return { notFound: true, error: 'Evaluación o ensayo no encontrado' };
  }

  if (parsedAssignmentId && !(exam.assignments || []).some((a) => a.id === parsedAssignmentId)) {
    return { badRequest: true, error: 'La asignación especificada no pertenece a esta evaluación' };
  }

  const submissions = await prisma.submission.findMany({
    where: {
      status: 'SUBMITTED',
      assignment: {
        examId: parsedExamId,
        ...(parsedAssignmentId ? { id: parsedAssignmentId } : {}),
      },
    },
    include: {
      answers: true,
      assignment: {
        include: { course: true },
      },
    },
  });

  const allAssignmentsCount = parsedAssignmentId ? 1 : (exam.assignments || []).length;
  const questionById = Object.fromEntries((exam.questions || []).map((q) => [q.id, q]));

  const answerUpdates = [];
  const submissionUpdates = [];
  const assignmentStatsMap = new Map();

  let updatedSubmissionsCount = 0;
  let updatedGradesCount = 0;
  let totalPrevGrade = 0;
  let totalPrevGradeCount = 0;
  let totalNextGrade = 0;
  let totalNextGradeCount = 0;

  for (const sub of submissions) {
    const answersMap = {};
    const awardedPointsMap = {};
    for (const a of sub.answers || []) {
      answersMap[a.questionId] = a.selectedAnswer;
      if (a.awardedPoints !== null && a.awardedPoints !== undefined) {
        awardedPointsMap[a.questionId] = a.awardedPoints;
      }
    }

    const results = computeResults(exam.questions || [], answersMap, exam, awardedPointsMap);
    const perQuestionById = Object.fromEntries(results.perQuestion.map((pq) => [pq.questionId, pq]));

    let subAnswersChanged = 0;
    for (const a of sub.answers || []) {
      const q = questionById[a.questionId];
      const pq = perQuestionById[a.questionId];
      if (!q || !pq) continue;

      const nextIsCorrect = pq.isCorrect ?? null;
      const currIsCorrect = a.isCorrect ?? null;
      const shouldClearAwarded = !isOpenQuestion(q) && a.awardedPoints !== null;

      if (currIsCorrect !== nextIsCorrect || shouldClearAwarded) {
        const updateData = { isCorrect: nextIsCorrect };
        if (shouldClearAwarded) {
          updateData.awardedPoints = null;
        }
        answerUpdates.push({ id: a.id, data: updateData });
        subAnswersChanged += 1;
      }
    }

    const nextSimce = results.simceScore ?? null;
    const currSimce = sub.simceScore ?? null;
    const currGrade = sub.grade ?? null;
    const currPercent = sub.percent ?? null;
    const currCorrectCount = sub.correctCount ?? null;
    const currLevel = sub.achievementLevel ?? null;

    const metricsChanged =
      currCorrectCount !== results.correctCount ||
      !nearlyEqual(currPercent, results.percent) ||
      !nearlyEqual(currGrade, results.grade) ||
      currLevel !== results.achievementLevel ||
      currSimce !== nextSimce ||
      !nearlyEqual(sub.theta, results.theta) ||
      !nearlyEqual(sub.seTheta, results.seTheta);

    const gradeOrScoreChanged =
      currCorrectCount !== results.correctCount ||
      !nearlyEqual(currPercent, results.percent) ||
      !nearlyEqual(currGrade, results.grade) ||
      currLevel !== results.achievementLevel ||
      currSimce !== nextSimce;

    if (metricsChanged) {
      submissionUpdates.push({
        id: sub.id,
        data: {
          correctCount: results.correctCount,
          percent: results.percent,
          grade: results.grade,
          achievementLevel: results.achievementLevel,
          simceScore: nextSimce,
          theta: results.theta,
          seTheta: results.seTheta,
        },
      });
    }

    const didSubChange = metricsChanged || subAnswersChanged > 0;
    if (didSubChange) updatedSubmissionsCount += 1;
    if (gradeOrScoreChanged) updatedGradesCount += 1;

    if (currGrade !== null && Number.isFinite(Number(currGrade))) {
      totalPrevGrade += Number(currGrade);
      totalPrevGradeCount += 1;
    }
    if (results.grade !== null && Number.isFinite(Number(results.grade))) {
      totalNextGrade += Number(results.grade);
      totalNextGradeCount += 1;
    }

    if (!assignmentStatsMap.has(sub.assignmentId)) {
      assignmentStatsMap.set(sub.assignmentId, {
        assignmentId: sub.assignmentId,
        courseName: formatCourseLabel(sub.assignment?.course),
        submittedCount: 0,
        updatedCount: 0,
        updatedGradesCount: 0,
        answersUpdatedCount: 0,
        prevGradeSum: 0,
        prevGradeCount: 0,
        nextGradeSum: 0,
        nextGradeCount: 0,
      });
    }

    const aStat = assignmentStatsMap.get(sub.assignmentId);
    aStat.submittedCount += 1;
    if (didSubChange) aStat.updatedCount += 1;
    if (gradeOrScoreChanged) aStat.updatedGradesCount += 1;
    aStat.answersUpdatedCount += subAnswersChanged;
    if (currGrade !== null && Number.isFinite(Number(currGrade))) {
      aStat.prevGradeSum += Number(currGrade);
      aStat.prevGradeCount += 1;
    }
    if (results.grade !== null && Number.isFinite(Number(results.grade))) {
      aStat.nextGradeSum += Number(results.grade);
      aStat.nextGradeCount += 1;
    }
  }

  if (answerUpdates.length > 0 || submissionUpdates.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const upd of answerUpdates) {
          await tx.submissionAnswer.update({
            where: { id: upd.id },
            data: upd.data,
          });
        }
        for (const upd of submissionUpdates) {
          await tx.submission.update({
            where: { id: upd.id },
            data: upd.data,
          });
        }
      },
      { timeout: 60000 }
    );
  }

  const effectiveActor = actor || { rut: 'SISTEMA', name: 'Administrador', role: 'ADMIN' };
  const cleanNote = note ? String(note).trim() : null;
  const gradingMode = normalizeGradingMode(exam.gradingMode);
  const passThreshold = normalizePassThreshold(exam.passThreshold, 0.6);
  const passThresholdPercent = Math.round(passThreshold * 100);

  for (const aStat of assignmentStatsMap.values()) {
    const previousAvgGrade = roundAvg(aStat.prevGradeSum, aStat.prevGradeCount);
    const newAvgGrade = roundAvg(aStat.nextGradeSum, aStat.nextGradeCount);

    await logAssignmentAction({
      assignmentId: aStat.assignmentId,
      action: 'GRADES_RECALCULATED',
      actor: effectiveActor,
      details: {
        examId: exam.id,
        examTitle: exam.title,
        gradingMode,
        passThreshold,
        passThresholdPercent,
        courseName: aStat.courseName,
        submittedCount: aStat.submittedCount,
        updatedCount: aStat.updatedCount,
        updatedGradesCount: aStat.updatedGradesCount,
        answersUpdatedCount: aStat.answersUpdatedCount,
        previousAvgGrade,
        newAvgGrade,
      },
      note:
        cleanNote ||
        `Recálculo masivo con la pauta actual (${(exam.questions || []).length} preguntas · ${
          gradingMode === 'NORMAL' ? `Modo Normal ${passThresholdPercent}% exigencia` : `Modo SIMCE ${passThresholdPercent}% exigencia`
        }).`,
    });
  }

  const evaluatedCount = submissions.length;
  const avgGradeBefore = roundAvg(totalPrevGrade, totalPrevGradeCount);
  const avgGradeAfter = roundAvg(totalNextGrade, totalNextGradeCount);

  return {
    message:
      evaluatedCount === 0
        ? 'No hay entregas finalizadas (SUBMITTED) para recalcular en esta evaluación.'
        : `Se recalcularon ${evaluatedCount} entrega(s) finalizada(s). ${updatedSubmissionsCount} entrega(s) actualizada(s).`,
    examId: exam.id,
    examTitle: exam.title,
    gradingMode,
    passThreshold,
    passThresholdPercent,
    questionCount: (exam.questions || []).length,
    assignmentsTotal: allAssignmentsCount,
    assignmentsAffected: assignmentStatsMap.size,
    evaluatedCount,
    updatedCount: updatedSubmissionsCount,
    updatedGradesCount,
    answersUpdatedCount: answerUpdates.length,
    unchangedCount: evaluatedCount - updatedSubmissionsCount,
    avgGradeBefore,
    avgGradeAfter,
  };
}

module.exports = {
  getDeadline,
  finalizeSubmission,
  sweepExpiredSubmissions,
  recalculateExamSubmissions,
};
