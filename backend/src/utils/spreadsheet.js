const exceljs = require('exceljs');
const { Readable } = require('stream');

/**
 * Parsea un archivo Excel (.xlsx) o CSV (.csv) desde un Buffer a un Worksheet de exceljs.
 * Detecta automáticamente si es CSV y su delimitador (;, ,, o tab).
 */
async function parseSpreadsheet(buffer, filename = '') {
  if (!buffer || buffer.length === 0) {
    throw new Error('El archivo está vacío. Por favor selecciona un archivo con datos.');
  }

  const lowerName = String(filename || '').toLowerCase();

  if (lowerName.endsWith('.xls') && !lowerName.endsWith('.xlsx')) {
    throw new Error('El formato .xls antiguo de Excel no es compatible. Por favor abre el archivo en Excel y guárdalo como Libro de Excel (.xlsx) o CSV (.csv).');
  }

  const wb = new exceljs.Workbook();
  const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;

  // 1. Si tiene firma de archivo zip ('PK') o extensión .xlsx, intentar como Excel primero
  if (isZip || lowerName.endsWith('.xlsx')) {
    try {
      await wb.xlsx.load(buffer);
      if (wb.worksheets && wb.worksheets.length > 0) {
        return wb.worksheets[0];
      }
    } catch (err) {
      if (isZip) {
        throw new Error('El archivo Excel (.xlsx) no se pudo leer o está corrupto: ' + (err.message || 'Error de lectura'));
      }
    }
  }

  // 2. Intentar como CSV (detectando delimitador y removiendo BOM UTF-8)
  try {
    let text = buffer.toString('utf-8');
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delimiter = firstLine.includes(';') ? ';' : (firstLine.includes('\t') ? '\t' : ',');
    await wb.csv.read(Readable.from(text), { parserOptions: { delimiter } });
    if (wb.worksheets && wb.worksheets.length > 0) {
      return wb.worksheets[0];
    }
  } catch (err) {
    // Si falló como CSV
  }

  throw new Error('No se pudo procesar la hoja de cálculo. Asegúrate de subir un archivo válido en formato .xlsx o .csv.');
}

/**
 * Crea una plantilla vacía estilizada en formato .xlsx.
 * @param {Array<{ header: string, key: string, width?: number }>} columns
 * @param {string} sheetName
 * @returns {Promise<Buffer>}
 */
async function createEmptyTemplate(columns, sheetName = 'Formato') {
  const wb = new exceljs.Workbook();
  wb.creator = 'Colegio Cerro Grande';
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
