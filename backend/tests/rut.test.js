const { isValidRut, normalizeRut, computeDv } = require('../src/utils/rut');

describe('RUT', () => {
  test('calcula dígito verificador', () => {
    expect(computeDv('11111111')).toBe('1');
    expect(computeDv('12345678')).toBe('5');
    expect(computeDv('20000003')).toBe('K');
  });

  test('valida RUT con y sin formato', () => {
    expect(isValidRut('12.345.678-5')).toBe(true);
    expect(isValidRut('123456785')).toBe(true);
    expect(isValidRut('20000003-k')).toBe(true);
    expect(isValidRut('12345678-9')).toBe(false);
    expect(isValidRut('abc')).toBe(false);
    expect(isValidRut('')).toBe(false);
  });

  test('normaliza a 12345678-K sin puntos', () => {
    expect(normalizeRut('12.345.678-5')).toBe('12345678-5');
    expect(normalizeRut(' 20000003-k ')).toBe('20000003-K');
  });
});
