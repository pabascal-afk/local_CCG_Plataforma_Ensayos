const {
  prob3PL,
  estimateThetaEAP,
  thetaToSimceScore,
  simceAchievementLevel,
  DIFFICULTY_PRESETS
} = require('../src/services/irt');

describe('prob3PL (Modelo Logístico de 3 Parámetros)', () => {
  test('la probabilidad es monótona creciente respecto a theta', () => {
    const pLow = prob3PL(-2.0, 1.0, 0.0, 0.25);
    const pMid = prob3PL(0.0, 1.0, 0.0, 0.25);
    const pHigh = prob3PL(2.0, 1.0, 0.0, 0.25);

    expect(pLow).toBeLessThan(pMid);
    expect(pMid).toBeLessThan(pHigh);
  });

  test('en theta muy bajo, la probabilidad converge al pseudo-azar c', () => {
    const pVeryLow = prob3PL(-10.0, 1.0, 0.0, 0.25);
    expect(pVeryLow).toBeCloseTo(0.25, 2);
  });

  test('en theta muy alto, la probabilidad converge a 1.0', () => {
    const pVeryHigh = prob3PL(10.0, 1.0, 0.0, 0.25);
    expect(pVeryHigh).toBeCloseTo(1.0, 2);
  });

  test('en theta = b, p(theta) = c + (1-c)/2 = (1+c)/2', () => {
    // Para c = 0.25, p = 1.25 / 2 = 0.625
    const pAtB = prob3PL(0.0, 1.0, 0.0, 0.25);
    expect(pAtB).toBeCloseTo(0.625, 2);
  });
});

describe('estimateThetaEAP (Estimación EAP de Habilidad Latente)', () => {
  const items = [
    { id: 1, difficulty: -1.0, discrimination: 1.0, guessing: 0.25 },
    { id: 2, difficulty: 0.0, discrimination: 1.0, guessing: 0.25 },
    { id: 3, difficulty: 1.0, discrimination: 1.0, guessing: 0.25 },
  ];

  test('todas correctas genera theta positivo (> 0.5)', () => {
    const { theta, seTheta } = estimateThetaEAP(items, { 1: true, 2: true, 3: true });
    expect(theta).toBeGreaterThan(0.5);
    expect(seTheta).toBeGreaterThan(0);
    expect(seTheta).toBeLessThan(1.5);
  });

  test('test largo (10 ítems) con todas correctas genera theta alto (> 1.2)', () => {
    const longTest = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      difficulty: (i - 4.5) * 0.4,
      discrimination: 1.2,
      guessing: 0.25
    }));
    const answers = Object.fromEntries(longTest.map(q => [q.id, true]));
    const { theta } = estimateThetaEAP(longTest, answers);
    expect(theta).toBeGreaterThan(1.2);
  });

  test('todas incorrectas genera theta negativo (< -1.0)', () => {
    const { theta, seTheta } = estimateThetaEAP(items, { 1: false, 2: false, 3: false });
    expect(theta).toBeLessThan(-1.0);
    expect(seTheta).toBeGreaterThan(0);
  });

  test('patrón medio genera theta cercano a 0.0', () => {
    const { theta } = estimateThetaEAP(items, { 1: true, 2: false, 3: false });
    expect(Math.abs(theta)).toBeLessThan(1.5);
  });

  test('sin ítems devuelve prior theta = 0, se = 1', () => {
    const res = estimateThetaEAP([], {});
    expect(res.theta).toBe(0.0);
    expect(res.seTheta).toBe(1.0);
  });
});

describe('thetaToSimceScore (Transformación a Escala SIMCE 100-400)', () => {
  test('theta = 0.0 da puntaje central 250', () => {
    expect(thetaToSimceScore(0.0)).toBe(250);
  });

  test('theta = +1.0 da puntaje 300', () => {
    expect(thetaToSimceScore(1.0)).toBe(300);
  });

  test('theta = -1.0 da puntaje 200', () => {
    expect(thetaToSimceScore(-1.0)).toBe(200);
  });

  test('los puntajes extremos se acotan estrictamente entre 100 y 400', () => {
    expect(thetaToSimceScore(-5.0)).toBe(100);
    expect(thetaToSimceScore(5.0)).toBe(400);
  });
});

describe('simceAchievementLevel (Estándares de Aprendizaje Oficiales)', () => {
  test('cortes oficiales 4° Básico (241 / 284)', () => {
    expect(simceAchievementLevel(200)).toBe('INSUFICIENTE');
    expect(simceAchievementLevel(240)).toBe('INSUFICIENTE');
    expect(simceAchievementLevel(241)).toBe('ELEMENTAL');
    expect(simceAchievementLevel(270)).toBe('ELEMENTAL');
    expect(simceAchievementLevel(283)).toBe('ELEMENTAL');
    expect(simceAchievementLevel(284)).toBe('ADECUADO');
    expect(simceAchievementLevel(350)).toBe('ADECUADO');
  });

  test('respeta cortes personalizados por examen', () => {
    expect(simceAchievementLevel(260, 250, 300)).toBe('ELEMENTAL');
    expect(simceAchievementLevel(310, 250, 300)).toBe('ADECUADO');
  });
});

describe('DIFFICULTY_PRESETS', () => {
  test('contiene los valores calibrados estándar', () => {
    expect(DIFFICULTY_PRESETS.FACIL).toBe(-1.5);
    expect(DIFFICULTY_PRESETS.MEDIA).toBe(0.0);
    expect(DIFFICULTY_PRESETS.DIFICIL).toBe(1.5);
  });
});
