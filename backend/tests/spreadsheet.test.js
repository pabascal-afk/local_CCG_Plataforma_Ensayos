const { parseSpreadsheet, createEmptyTemplate } = require('../src/utils/spreadsheet');
const exceljs = require('exceljs');

describe('Spreadsheet Utility', () => {
  test('should generate an empty template buffer with correct columns', async () => {
    const columns = [
      { header: 'RUT', key: 'rut', width: 14 },
      { header: 'Nombre', key: 'name', width: 30 }
    ];
    const buffer = await createEmptyTemplate(columns, 'Test');
    expect(Buffer.isBuffer(buffer)).toBe(true);

    const wb = new exceljs.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];
    expect(sheet.name).toBe('Test');
    expect(sheet.rowCount).toBe(1); // Only header
    expect(sheet.getRow(1).getCell(1).value).toBe('RUT');
    expect(sheet.getRow(1).getCell(2).value).toBe('Nombre');
  });

  test('should parse CSV with semicolons', async () => {
    const csvContent = 'RUT;Nombre;Curso;Rol\n12345678-5;Juan Perez;4B A;STUDENT\n87654321-4;Ana Lopez;4B A;STUDENT';
    const sheet = await parseSpreadsheet(Buffer.from(csvContent, 'utf-8'), 'alumnos.csv');
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(1).getCell(1).text).toBe('RUT');
    expect(sheet.getRow(2).getCell(1).text).toBe('12345678-5');
    expect(sheet.getRow(3).getCell(2).text).toBe('Ana Lopez');
  });

  test('should parse CSV with commas', async () => {
    const csvContent = 'Nivel,Letra,Año\n4B,A,2026\n6B,B,2026';
    const sheet = await parseSpreadsheet(Buffer.from(csvContent, 'utf-8'), 'cursos.csv');
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(1).getCell(1).text).toBe('Nivel');
    expect(sheet.getRow(2).getCell(1).text).toBe('4B');
    expect(sheet.getRow(3).getCell(2).text).toBe('B');
  });

  test('should parse XLSX buffer', async () => {
    const wb = new exceljs.Workbook();
    const s = wb.addWorksheet('Sheet1');
    s.addRow(['Col1', 'Col2']);
    s.addRow(['Val1', 'Val2']);
    const buf = await wb.xlsx.writeBuffer();

    const sheet = await parseSpreadsheet(buf, 'test.xlsx');
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(1).text).toBe('Val1');
  });
});
