const { PrismaClient } = require('@prisma/client');
const { computeResults } = require('./src/services/grading');
const prisma = new PrismaClient();

async function backfill() {
  const submissions = await prisma.submission.findMany({
    where: { status: 'SUBMITTED', simceScore: null },
    include: {
      assignment: { include: { exam: { include: { questions: true } } } },
      answers: true
    }
  });

  console.log(`Encontradas ${submissions.length} entregas antiguas sin puntaje SIMCE.`);

  for (const s of submissions) {
    const questions = s.assignment.exam.questions;
    const answersMap = {};
    for (const a of s.answers) answersMap[a.questionId] = a.selectedAnswer;

    const res = computeResults(questions, answersMap, s.assignment.exam);

    await prisma.submission.update({
      where: { id: s.id },
      data: {
        simceScore: res.simceScore,
        theta: res.theta,
        seTheta: res.seTheta,
        achievementLevel: res.achievementLevel,
      }
    });
  }

  console.log("¡Backfill completado exitosamente!");
}

backfill().catch(console.error).finally(() => prisma.$disconnect());
