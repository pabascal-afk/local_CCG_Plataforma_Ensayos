const { chileanGrade, achievementLevel, computeResults } = require('../src/services/grading');

describe('chileanGrade (exigencia 60%, mínimo 1.0)', () => {
  test.each([
    [0, 1.0],
    [0.3, 2.5],
    [0.59, 3.9],
    [0.6, 4.0],
    [0.8, 5.5],
    [1, 7.0],
  ])('logro %p => nota %p', (p, expected) => {
    expect(chileanGrade(p)).toBe(expected);
  });

  test('quien no alcanza la exigencia nunca obtiene 4.0 por redondeo', () => {
    expect(chileanGrade(0.599)).toBe(3.9);
  });

  test('exigencia 50% y nota mínima 2.0', () => {
    expect(chileanGrade(0.5, 0.5, 2.0)).toBe(4.0);
    expect(chileanGrade(0, 0.5, 2.0)).toBe(2.0);
    expect(chileanGrade(0.25, 0.5, 2.0)).toBe(3.0);
  });

  test('valores fuera de rango se acotan', () => {
    expect(chileanGrade(-1)).toBe(1.0);
    expect(chileanGrade(2)).toBe(7.0);
  });
});

describe('achievementLevel (cortes 50% / 75%)', () => {
  test.each([
    [0.2, 'INSUFICIENTE'],
    [0.499, 'INSUFICIENTE'],
    [0.5, 'ELEMENTAL'],
    [0.74, 'ELEMENTAL'],
    [0.75, 'ADECUADO'],
    [1, 'ADECUADO'],
  ])('logro %p => %s', (p, level) => {
    expect(achievementLevel(p)).toBe(level);
  });
});

describe('computeResults', () => {
  const questions = [
    { id: 1, correctAnswer: 'A', skill: 'Localizar', axis: 'Lectura' },
    { id: 2, correctAnswer: 'B', skill: 'Localizar', axis: 'Lectura' },
    { id: 3, correctAnswer: 'C', skill: 'Interpretar', axis: 'Lectura' },
    { id: 4, correctAnswer: 'E', skill: 'Reflexionar', axis: null },
  ];

  test('cuenta correctas, sin responder y calcula nota y nivel', () => {
    const r = computeResults(questions, { 1: 'A', 2: 'C', 4: 'E' });
    expect(r.total).toBe(4);
    expect(r.correctCount).toBe(2);
    expect(r.percent).toBe(50);
    expect(r.grade).toBe(3.5);
    expect(r.achievementLevel).toBe('ELEMENTAL');
    expect(r.perQuestion.find((q) => q.questionId === 3)).toEqual({ questionId: 3, selected: null, isCorrect: false });
  });

  test('desglose por habilidad y eje (con "Sin clasificar")', () => {
    const r = computeResults(questions, { 1: 'A', 2: 'B', 3: 'A' });
    expect(r.bySkill.find((s) => s.name === 'Localizar')).toMatchObject({ total: 2, correct: 2, percent: 100 });
    expect(r.bySkill.find((s) => s.name === 'Interpretar')).toMatchObject({ total: 1, correct: 0, percent: 0 });
    expect(r.byAxis.find((s) => s.name === 'Sin clasificar')).toMatchObject({ total: 1, correct: 0 });
  });

  test('respeta la configuración del ensayo', () => {
    const r = computeResults(questions, { 1: 'A', 2: 'B' }, { passThreshold: 0.5, cutElemental: 0.4, cutAdecuado: 0.5 });
    expect(r.grade).toBe(4.0);
    expect(r.achievementLevel).toBe('ADECUADO');
  });

  test('calcula puntaje SIMCE estandarizado y parámetros TRI', () => {
    const r = computeResults(questions, { 1: 'A', 2: 'B', 3: 'C', 4: 'E' }, { simceCutElemental: 241, simceCutAdecuado: 284 });
    expect(r.simceScore).toBeGreaterThanOrEqual(100);
    expect(r.simceScore).toBeLessThanOrEqual(400);
    expect(r.theta).toBeDefined();
    expect(r.seTheta).toBeDefined();
    expect(r.achievementLevel).toBe('ADECUADO');
  });

  test('ensayo vacío no divide por cero', () => {
    const r = computeResults([], {});
    expect(r.percent).toBe(0);
    expect(r.grade).toBe(1.0);
    expect(r.simceScore).toBe(100);
  });
});
