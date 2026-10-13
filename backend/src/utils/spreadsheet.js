const exceljs = require('exceljs');
const { Readable } = require('stream');

/**
 * Parsea un archivo Excel (.xlsx) o CSV (.csv) desde un Buffer a un Worksheet de exceljs.
 * Detecta automáticamente si es CSV y su delimitador (;, ,, o tab).
 */
async function parseSpreadsheet(buffer, filename = '') {
  if (!buffer || buffer.length === 0) {
    throw new Error('El archivo está vacío');
  }

  const wb = new exceljs.Workbook();
  const lowerName = String(filename || '').toLowerCase();
  
  // Si la extensión es .csv, o si el archivo no empieza con 'PK' (0x50, 0x4B - firma zip de xlsx)
  const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isCsv = lowerName.endsWith('.csv') || !isZip;

  if (isCsv) {
    try {
      const text = buffer.toString('utf-8');
      const firstLine = text.split('\n')[0] || '';
      const delimiter = firstLine.includes(';') ? ';' : (firstLine.includes('\t') ? '\t' : ',');
      await wb.csv.read(Readable.from(text), { parserOptions: { delimiter } });
      if (wb.worksheets.length > 0) return wb.worksheets[0];
    } catch {
      // Fallback a xlsx si fallara
    }
  }

  // Intento como xlsx
  try {
    await wb.xlsx.load(buffer);
    if (wb.worksheets.length > 0) return wb.worksheets[0];
  } catch (err) {
    if (isZip) {
      throw new Error('El archivo Excel (.xlsx) está dañado o no es válido');
    }
    // Si no era zip y falló xlsx, intentar csv con coma
    const text = buffer.toString('utf-8');
    await wb.csv.read(Readable.from(text), { parserOptions: { delimiter: ',' } });
    if (wb.worksheets.length > 0) return wb.worksheets[0];
  }

  throw new Error('No se pudo leer la hoja de cálculo');
}

/**
 * Crea una plantilla vacía estilizada en formato .xlsx.
 * @param {Array<{ header: string, key: string, width?: number }>} columns
 * @param {string} sheetName
 * @returns {Promise<Buffer>}
 */
async function createEmptyTemplate(columns, sheetName = 'Formato') {
  const wb = new exceljs.Workbook();
  wb.creator = 'Colegio Concepción de Chillán';
  wb.created = new Date();

  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width || Math.max(c.header.length + 6, 14)
  }));

  // Estilo de la fila de encabezado
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' } // Azul marino institucional
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;

  return await wb.xlsx.writeBuffer();
}

module.exports = { parseSpreadsheet, createEmptyTemplate };
