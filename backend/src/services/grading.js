/**
 * Servicio de corrección. Funciones puras (sin acceso a BD) para poder testearlas.
 */

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Nota chilena 1.0–7.0 con exigencia configurable.
 * @param {number} p proporción de logro (0..1)
 * @param {number} e exigencia para el 4.0 (0..1), por defecto 0.6
 * @param {number} min nota mínima, por defecto 1.0
 */
function chileanGrade(p, e = 0.6, min = 1.0) {
  const ratio = Math.max(0, Math.min(1, p));
  let grade;
  if (ratio < e) {
    grade = min + (4 - min) * (ratio / e);
  } else if (e >= 1) {
    grade = 7;
  } else {
    grade = 4 + 3 * ((ratio - e) / (1 - e));
  }
  // Evita que el redondeo suba a 4.0 a quien no alcanzó la exigencia.
  if (ratio < e) return Math.min(round1(grade), 3.9);
  return Math.min(7, round1(grade));
}

function achievementLevel(p, cutElemental = 0.5, cutAdecuado = 0.75) {
  if (p >= cutAdecuado) return 'ADECUADO';
  if (p >= cutElemental) return 'ELEMENTAL';
  return 'INSUFICIENTE';
}

function isOpenQuestion(q) {
  return q && (q.questionType === 'WRITTEN' || q.questionType === 'ORAL');
}

function getQuestionMaxPoints(q) {
  const mp = Number(q?.maxPoints);
  return Number.isFinite(mp) && mp > 0 ? mp : 1;
}

function groupStats(questions, answers, key, awardedPointsMap = {}) {
  const groups = {};
  for (const q of questions) {
    const name = q[key] || 'Sin clasificar';
    if (!groups[name]) groups[name] = { name, total: 0, correct: 0 };
    const maxPts = getQuestionMaxPoints(q);
    groups[name].total += maxPts;

    if (isOpenQuestion(q)) {
      const rawAwarded = awardedPointsMap[q.id];
      if (rawAwarded !== undefined && rawAwarded !== null && !Number.isNaN(Number(rawAwarded))) {
        const earned = Math.max(0, Math.min(maxPts, Number(rawAwarded)));
        groups[name].correct += earned;
      }
    } else {
      if (answers[q.id] && answers[q.id] === q.correctAnswer) {
        groups[name].correct += maxPts;
      }
    }
  }
  return Object.values(groups).map((g) => ({
    name: g.name,
    total: round1(g.total),
    correct: round1(g.correct),
    percent: g.total ? Math.round((g.correct / g.total) * 1000) / 10 : 0,
  }));
}

const { estimateThetaEAP, thetaToSimceScore, simceAchievementLevel } = require('./irt');

/**
 * @param {Array<{id:number, correctAnswer:string, questionType?:string, maxPoints?:number, skill?:string, axis?:string, difficulty?:number, discrimination?:number, guessing?:number}>} questions
 * @param {Record<number,string>} answers  mapa questionId -> alternativa marcada o respuesta
 * @param {{passThreshold?:number, minGrade?:number, cutElemental?:number, cutAdecuado?:number, simceCutElemental?:number, simceCutAdecuado?:number}} exam
 * @param {Record<number,number|null>} awardedPointsMap  mapa questionId -> puntos otorgados por el docente en preguntas WRITTEN / ORAL
 */
function computeResults(questions, answers, exam = {}, awardedPointsMap = {}) {
  let totalMaxPoints = 0;
  let totalEarnedPoints = 0;
  const irtResponsesMap = {};

  const perQuestion = questions.map((q) => {
    const maxPts = getQuestionMaxPoints(q);
    totalMaxPoints += maxPts;

    const selected = answers[q.id] !== undefined ? answers[q.id] : null;

    if (isOpenQuestion(q)) {
      const rawAwarded = awardedPointsMap[q.id];
      const hasAwarded = rawAwarded !== undefined && rawAwarded !== null && rawAwarded !== '' && !Number.isNaN(Number(rawAwarded));
      const earnedPoints = hasAwarded ? Math.max(0, Math.min(maxPts, Number(rawAwarded))) : 0;
      totalEarnedPoints += earnedPoints;

      const isCorrect = hasAwarded ? earnedPoints >= maxPts * (exam.passThreshold ?? 0.6) : null;
      if (hasAwarded) {
        irtResponsesMap[q.id] = maxPts > 0 ? earnedPoints / maxPts : 0;
      }

      return {
        questionId: q.id,
        selected,
        isCorrect,
        awardedPoints: hasAwarded ? earnedPoints : null,
        maxPoints: maxPts,
      };
    }

    const isCorrect = selected !== null && selected === q.correctAnswer;
    const earnedPoints = isCorrect ? maxPts : 0;
    totalEarnedPoints += earnedPoints;
    irtResponsesMap[q.id] = isCorrect ? 1.0 : 0.0;

    return {
      questionId: q.id,
      selected,
      isCorrect,
      awardedPoints: earnedPoints,
      maxPoints: maxPts,
    };
  });

  const ratio = totalMaxPoints > 0 ? totalEarnedPoints / totalMaxPoints : 0;

  // Cálculo psicométrico TRI / Modelo 3PL
  const { theta, seTheta } = estimateThetaEAP(questions, irtResponsesMap);
  const simceScore = totalMaxPoints > 0 ? thetaToSimceScore(theta) : 100;
  
  // Nivel de logro:
  // Si el examen define cortes SIMCE explícitos, clasifica por escala SIMCE.
  // De lo contrario, clasifica por porcentaje de exigencia tradicional.
  let level;
  if (exam.simceCutElemental !== undefined || exam.simceCutAdecuado !== undefined) {
    level = simceAchievementLevel(simceScore, exam.simceCutElemental ?? 241, exam.simceCutAdecuado ?? 284);
  } else {
    level = achievementLevel(ratio, exam.cutElemental ?? 0.5, exam.cutAdecuado ?? 0.75);
  }

  return {
    total: Math.round(totalMaxPoints),
    maxPoints: round1(totalMaxPoints),
    earnedPoints: round1(totalEarnedPoints),
    correctCount: Math.round(totalEarnedPoints),
    percent: Math.round(ratio * 1000) / 10,
    grade: chileanGrade(ratio, exam.passThreshold ?? 0.6, exam.minGrade ?? 1.0),
    achievementLevel: level,
    simceScore,
    theta,
    seTheta,
    perQuestion,
    bySkill: groupStats(questions, answers, 'skill', awardedPointsMap),
    byAxis: groupStats(questions, answers, 'axis', awardedPointsMap),
  };
}

module.exports = { chileanGrade, achievementLevel, computeResults, isOpenQuestion, getQuestionMaxPoints };

