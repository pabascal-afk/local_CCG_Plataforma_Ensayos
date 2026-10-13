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

function groupStats(questions, answers, key) {
  const groups = {};
  for (const q of questions) {
    const name = q[key] || 'Sin clasificar';
    if (!groups[name]) groups[name] = { name, total: 0, correct: 0 };
    groups[name].total += 1;
    if (answers[q.id] && answers[q.id] === q.correctAnswer) groups[name].correct += 1;
  }
  return Object.values(groups).map((g) => ({
    ...g,
    percent: g.total ? Math.round((g.correct / g.total) * 1000) / 10 : 0,
  }));
}

const { estimateThetaEAP, thetaToSimceScore, simceAchievementLevel } = require('./irt');

/**
 * @param {Array<{id:number, correctAnswer:string, skill?:string, axis?:string, difficulty?:number, discrimination?:number, guessing?:number}>} questions
 * @param {Record<number,string>} answers  mapa questionId -> alternativa marcada
 * @param {{passThreshold?:number, minGrade?:number, cutElemental?:number, cutAdecuado?:number, simceCutElemental?:number, simceCutAdecuado?:number}} exam
 */
function computeResults(questions, answers, exam = {}) {
  const total = questions.length;
  let correctCount = 0;
  const isCorrectMap = {};

  const perQuestion = questions.map((q) => {
    const selected = answers[q.id] || null;
    const isCorrect = selected !== null && selected === q.correctAnswer;
    if (isCorrect) correctCount += 1;
    isCorrectMap[q.id] = isCorrect;
    return { questionId: q.id, selected, isCorrect };
  });

  const ratio = total ? correctCount / total : 0;

  // Cálculo psicométrico TRI / Modelo 3PL
  const { theta, seTheta } = estimateThetaEAP(questions, isCorrectMap);
  const simceScore = total ? thetaToSimceScore(theta) : 100;
  
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
    total,
    correctCount,
    percent: Math.round(ratio * 1000) / 10,
    grade: chileanGrade(ratio, exam.passThreshold ?? 0.6, exam.minGrade ?? 1.0),
    achievementLevel: level,
    simceScore,
    theta,
    seTheta,
    perQuestion,
    bySkill: groupStats(questions, answers, 'skill'),
    byAxis: groupStats(questions, answers, 'axis'),
  };
}

module.exports = { chileanGrade, achievementLevel, computeResults };
