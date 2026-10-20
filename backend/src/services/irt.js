/**
 * Motor Psicométrico de Teoría de Respuesta al Ítem (TRI / IRT).
 * Implementa el Modelo Logístico de 3 Parámetros (3PL) y estimación EAP
 * (Expected A Posteriori) alineado con los estándares del SIMCE chileno.
 */

const D_FACTOR = 1.702; // Constante de escala para aproximar la distribución normal acumulada

/**
 * Probabilidad de respuesta correcta bajo el modelo 3PL.
 * P_i(theta) = c + (1 - c) / (1 + exp(-1.702 * a * (theta - b)))
 *
 * @param {number} theta Habilidad del estudiante (-4 a +4)
 * @param {number} a Discriminación del ítem (> 0, típico 0.5 a 2.5)
 * @param {number} b Dificultad del ítem (-3 a +3)
 * @param {number} c Pseudo-azar / adivinación (0 a 0.5)
 */
function prob3PL(theta, a = 1.0, b = 0.0, c = 0.25) {
  const safeA = Math.max(0.1, Number(a) || 1.0);
  const safeB = Number.isFinite(Number(b)) ? Number(b) : 0.0;
  const safeC = Math.max(0, Math.min(0.5, Number(c) !== undefined ? Number(c) : 0.25));

  const exponent = -D_FACTOR * safeA * (theta - safeB);
  // Evitar overflow numérico en exponente
  if (exponent > 40) return safeC;
  if (exponent < -40) return 1.0;

  return safeC + (1 - safeC) / (1 + Math.exp(exponent));
}

/**
 * Genera nodos de cuadratura Gaussiana para integración numérica EAP.
 * Rango [-4.0, +4.0] con 41 nodos uniformes.
 */
function getQuadratureNodes(count = 41, min = -4.0, max = 4.0) {
  const step = (max - min) / (count - 1);
  const nodes = [];
  const sqrt2pi = Math.sqrt(2 * Math.PI);

  for (let i = 0; i < count; i++) {
    const theta = min + i * step;
    // Densidad prior normal estándar N(0, 1)
    const prior = Math.exp(-0.5 * theta * theta) / sqrt2pi;
    const weight = prior * step;
    nodes.push({ theta, weight });
  }
  return nodes;
}

const QUADRATURE_NODES = getQuadratureNodes(41, -4.0, 4.0);

/**
 * Estima la habilidad theta (y su error estándar) mediante EAP (Expected A Posteriori)
 * dado un vector de preguntas calibradas y respuestas (1 = correcta, 0 = incorrecta).
 *
 * @param {Array<{id: number, difficulty?: number, discrimination?: number, guessing?: number}>} questions
 * @param {Record<number, boolean>} responses Mapa de questionId -> isCorrect
 * @returns {{theta: number, seTheta: number}}
 */
function estimateThetaEAP(questions, responses) {
  if (!questions || questions.length === 0) {
    return { theta: 0.0, seTheta: 1.0 };
  }

  // Si no hay respuestas marcadas, devolver prior estándar (theta=0, se=1)
  const validQuestions = questions.filter(q => responses[q.id] !== undefined && responses[q.id] !== null);
  if (validQuestions.length === 0) {
    return { theta: 0.0, seTheta: 1.0 };
  }

  // Pre-calcular log-verosimilitudes sobre los nodos de cuadratura
  const logLikelihoods = new Float64Array(QUADRATURE_NODES.length);

  for (let k = 0; k < QUADRATURE_NODES.length; k++) {
    const theta = QUADRATURE_NODES[k].theta;
    let logL = 0;

    for (let i = 0; i < validQuestions.length; i++) {
      const q = validQuestions[i];
      const rawResp = responses[q.id];
      const propCorrect = typeof rawResp === 'number'
        ? Math.max(0, Math.min(1, rawResp))
        : (rawResp ? 1.0 : 0.0);
      const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL';
      const guessingVal = isOpen ? 0.0 : (q.guessing ?? 0.25);
      const p = prob3PL(theta, q.discrimination ?? 1.0, q.difficulty ?? 0.0, guessingVal);
      const safeP = Math.max(1e-12, Math.min(1 - 1e-12, p));

      logL += propCorrect * Math.log(safeP) + (1 - propCorrect) * Math.log(1 - safeP);
    }

    logLikelihoods[k] = logL;
  }

  // Truco log-sum-exp para estabilidad numérica evitando underflow
  let maxLogL = -Infinity;
  for (let k = 0; k < logLikelihoods.length; k++) {
    if (logLikelihoods[k] > maxLogL) maxLogL = logLikelihoods[k];
  }

  let totalWeight = 0;
  const posteriors = new Float64Array(QUADRATURE_NODES.length);

  for (let k = 0; k < QUADRATURE_NODES.length; k++) {
    const likelihood = Math.exp(logLikelihoods[k] - maxLogL);
    const unnormalizedPosterior = likelihood * QUADRATURE_NODES[k].weight;
    posteriors[k] = unnormalizedPosterior;
    totalWeight += unnormalizedPosterior;
  }

  if (totalWeight <= 0) {
    return { theta: 0.0, seTheta: 1.0 };
  }

  // Normalizar y calcular media y varianza posterior
  let meanTheta = 0;
  for (let k = 0; k < QUADRATURE_NODES.length; k++) {
    posteriors[k] /= totalWeight;
    meanTheta += QUADRATURE_NODES[k].theta * posteriors[k];
  }

  let variance = 0;
  for (let k = 0; k < QUADRATURE_NODES.length; k++) {
    const diff = QUADRATURE_NODES[k].theta - meanTheta;
    variance += diff * diff * posteriors[k];
  }

  const seTheta = Math.sqrt(variance);

  return {
    theta: Math.round(meanTheta * 1000) / 1000,
    seTheta: Math.round(seTheta * 1000) / 1000
  };
}

/**
 * Convierte la habilidad latente theta (-4 a +4) en el Puntaje SIMCE oficial
 * en escala centrada en 250 con desviación estándar 50.
 *
 * SIMCE = 250 + 50 * theta (acotado entre 100 y 400 puntos)
 *
 * @param {number} theta
 * @returns {number} Puntaje entero 100 a 400
 */
function thetaToSimceScore(theta) {
  const raw = 250 + 50 * theta;
  const bounded = Math.max(100, Math.min(400, Math.round(raw)));
  return bounded;
}

/**
 * Determina el Estándar de Aprendizaje oficial según los puntajes de corte SIMCE.
 * Cortes por defecto (4° Básico):
 * - Insuficiente: < 241
 * - Elemental: 241 a 283
 * - Adecuado: >= 284
 *
 * @param {number} simceScore
 * @param {number} cutElemental
 * @param {number} cutAdecuado
 * @returns {'INSUFICIENTE' | 'ELEMENTAL' | 'ADECUADO'}
 */
function simceAchievementLevel(simceScore, cutElemental = 241, cutAdecuado = 284) {
  if (simceScore >= cutAdecuado) return 'ADECUADO';
  if (simceScore >= cutElemental) return 'ELEMENTAL';
  return 'INSUFICIENTE';
}

/**
 * Mapeo de dificultades cualitativas a valor numérico de parámetro b.
 */
const DIFFICULTY_PRESETS = {
  FACIL: -1.5,
  MEDIA: 0.0,
  DIFICIL: 1.5,
};

module.exports = {
  prob3PL,
  estimateThetaEAP,
  thetaToSimceScore,
  simceAchievementLevel,
  DIFFICULTY_PRESETS,
};
