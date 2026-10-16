const ExcelJS = require('./backend/node_modules/exceljs');
const path = require('path');

async function createTemplate(outputPath) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Colegio Cerro Grande - Plataforma de Evaluaciones';
    wb.created = new Date();

    // Hoja 1: Pauta_Oficial
    const ws = wb.addWorksheet('Pauta_Oficial', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    ws.columns = [
        { header: 'Numero', key: 'number', width: 10 },
        { header: 'Clave', key: 'key', width: 10 },
        { header: 'Habilidad', key: 'skill', width: 26 },
        { header: 'Eje', key: 'axis', width: 24 },
        { header: 'OA', key: 'oa', width: 14 },
        { header: 'Dificultad', key: 'difficulty', width: 14 },
        { header: 'Enunciado_Pregunta', key: 'question', width: 45 },
        { header: 'Opcion_A', key: 'opt_a', width: 25 },
        { header: 'Opcion_B', key: 'opt_b', width: 25 },
        { header: 'Opcion_C', key: 'opt_c', width: 25 },
        { header: 'Opcion_D', key: 'opt_d', width: 25 },
        { header: 'Justificacion_Pedagogica', key: 'feedback', width: 40 }
    ];

    // Estilo encabezado
    const headerRow = ws.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (colNumber <= 6) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Azul oscuro oficial
        } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }; // Azul medio para detalles
        }
    });

    // Filas de ejemplo diagnósticas (24 ítems)
    const sampleRows = [
        [1, 'B', 'Localizar información', 'Lectura', 'OA 3', -0.8, 'Según la infografía del texto 1, ¿cuál es el porcentaje de...?', '15%', '25%', '35%', '45%', 'La alternativa B extrae el dato literal de la figura 2.'],
        [2, 'C', 'Interpretar y relacionar', 'Lectura', 'OA 4', 0.2, 'A partir del fragmento leído, ¿qué motivación explica la decisión de...?', 'Sentimiento de culpa', 'Deseo de reconocimiento', 'Búsqueda de justicia', 'Temor al fracaso', 'C infiere la causa principal basándose en las acciones del protagonista.'],
        [3, 'A', 'Reflexionar y evaluar', 'Lectura', 'OA 8', 1.1, '¿Con qué propósito el autor incluye la cita del experto en el párrafo 4?', 'Respaldar su tesis central con evidencia', 'Contradecir la postura del oponente', 'Ejemplificar un caso aislado', 'Entretener al lector con una anécdotda', 'A evalúa la función argumentativa del recurso en el texto.'],
        [4, 'D', 'Resolver Problemas', 'Números y Operaciones', 'OA 1', -0.5, 'En un almacén se empaquetan 1.250 bolsas en cajas de 25 unidades. ¿Cuántas cajas...?', '40 cajas', '45 cajas', '48 cajas', '50 cajas', 'D resuelve 1250 / 25 = 50. Las otras reflejan errores en la división.'],
        [5, 'B', 'Modelar', 'Álgebra y Patrones', 'OA 4', 0.4, 'Si el triple de un número aumentado en 8 equivale a 35, ¿cuál es la ecuación...?', '3x - 8 = 35', '3x + 8 = 35', 'x/3 + 8 = 35', '3(x + 8) = 35', 'B traduce correctamente el enunciado algebraico formal.'],
        [6, 'A', 'Reading Comprehension', 'Comprensión Lectora', 'OA 1', -0.2, 'According to the email, what time does the science workshop start?', 'At 10:30 AM', 'At 11:00 AM', 'At 2:00 PM', 'At 4:30 PM', 'A identifies explicit time from line 3.'],
        [7, 'C', 'Use of English / Grammar', 'Manejo de la Lengua', 'OA 3', 0.5, 'Complete: If Sarah _______ harder last week, she would have passed the exam.', 'studies', 'will study', 'had studied', 'has studied', 'C applies third conditional correctly.'],
        [8, 'B', 'Vocabulary in Context', 'Léxico y Vocabulario', 'OA 2', 0.0, 'In paragraph 2, the word "reluctant" is closest in meaning to:', 'eager', 'unwilling', 'excited', 'confident', 'B identifies correct synonym in context.']
    ];

    sampleRows.forEach(r => {
        const row = ws.addRow(r);
        row.height = 20;
        row.eachCell((cell, colNumber) => {
            cell.font = { name: 'Calibri', size: 10 };
            if (colNumber === 1 || colNumber === 2 || colNumber === 5 || colNumber === 6) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }
        });
    });

    // Hoja 2: Instrucciones_y_Formato
    const wsHelp = wb.addWorksheet('Instrucciones');
    wsHelp.columns = [
        { header: 'Columna', key: 'col', width: 20 },
        { header: 'Obligatoria', key: 'req', width: 14 },
        { header: 'Valores Permitidos', key: 'val', width: 30 },
        { header: 'Descripción y Recomendación DIA', key: 'desc', width: 65 }
    ];
    const helpHeader = wsHelp.getRow(1);
    helpHeader.height = 26;
    helpHeader.eachCell(c => {
        c.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        c.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const helpData = [
        ['Numero', 'SÍ', '1 a 24 (correlativo)', 'Número de orden de la pregunta en la prueba.'],
        ['Clave', 'SÍ', 'A, B, C, D (o E)', 'Letra de la respuesta correcta indiscutible.'],
        ['Habilidad', 'Recomendado', 'Texto libre', 'Habilidad cognitiva MINEDUC (ej. Localizar, Interpretar, Reflexionar, Resolver Problemas, Modelar).'],
        ['Eje', 'Recomendado', 'Texto libre', 'Eje temático curricular (ej. Lectura, Números, Geometría, Comprensión Lectora Inglés).'],
        ['OA', 'Recomendado', 'Texto (ej. OA 1, OA 3)', 'Objetivo de Aprendizaje priorizado evaluado por el ítem.'],
        ['Dificultad', 'Opcional', 'Número decimal (-2.0 a +2.0)', '-1.0 Fácil (Elemental DIA), 0.0 Media, +1.0 Difícil (Adecuado DIA).'],
        ['Enunciado_Pregunta', 'Opcional', 'Texto libre', 'Texto del ítem para respaldo y consulta en la plataforma.'],
        ['Opcion_A a D', 'Opcional', 'Texto libre', 'Opciones de respuesta con distractores plausibles.'],
        ['Justificacion', 'Opcional', 'Texto libre', 'Justificación pedagógica y diagnóstico del error del distractor.']
    ];

    helpData.forEach(hd => {
        const row = wsHelp.addRow(hd);
        row.height = 20;
        row.eachCell((c, colNum) => {
            c.font = { name: 'Calibri', size: 10 };
            if (colNum <= 2) c.alignment = { vertical: 'middle', horizontal: 'center' };
            else c.alignment = { vertical: 'middle', horizontal: 'left' };
        });
    });

    await wb.xlsx.writeFile(outputPath);
    console.log('Template created at:', outputPath);
}

async function main() {
    const out1 = path.join(__dirname, 'Plantilla_Formato_Pauta_Pruebas.xlsx');
    const out2 = path.join(__dirname, '..', 'PRUEBAS CCG', 'Plantilla_Formato_Pauta_Pruebas.xlsx');
    await createTemplate(out1);
    try {
        await createTemplate(out2);
    } catch (e) {}
    console.log('Done!');
}

main().catch(console.error);
