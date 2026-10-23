const { prisma } = require('../lib/prisma');

/**
 * Registra una acción de auditoría sobre una asignación de prueba/ensayo.
 *
 * @param {Object} params
 * @param {number} params.assignmentId - ID de la asignación (ExamAssignment)
 * @param {string} params.action - Código semántico de la acción (ej: COURSE_REACTIVATED)
 * @param {Object} params.actor - Usuario que ejecuta la acción (req.user)
 * @param {string} params.actor.rut - RUT del usuario
 * @param {string} params.actor.name - Nombre del usuario
 * @param {string} params.actor.role - Rol (ADMIN, DIRECTOR, TEACHER)
 * @param {Object} [params.targetStudent] - Opcional: Estudiante afectado si es acción individual
 * @param {string} [params.targetStudent.rut] - RUT del estudiante
 * @param {string} [params.targetStudent.name] - Nombre del estudiante
 * @param {Object|string} [params.details] - Metadatos estructurados (diffs, horas, minutos, modos, etc.)
 * @param {string} [params.note] - Motivo o justificación opcional
 * @returns {Promise<Object|null>} El registro creado o null en caso de error
 */
async function logAssignmentAction({
  assignmentId,
  action,
  actor,
  targetStudent,
  details,
  note
}) {
  try {
    if (!assignmentId || !action || !actor) {
      console.warn('[logAssignmentAction] Faltan parámetros obligatorios:', { assignmentId, action, actor });
      return null;
    }

    const parsedAssignmentId = parseInt(assignmentId, 10);
    if (isNaN(parsedAssignmentId)) return null;

    let detailsJson = null;
    if (details) {
      if (typeof details === 'string') {
        detailsJson = details;
      } else {
        try {
          detailsJson = JSON.stringify(details);
        } catch {
          detailsJson = String(details);
        }
      }
    }

    const created = await prisma.assignmentActionLog.create({
      data: {
        assignmentId: parsedAssignmentId,
        action: String(action).trim(),
        actorRut: actor.rut || 'SISTEMA',
        actorName: actor.name || 'Usuario',
        actorRole: actor.role || 'TEACHER',
        targetRut: targetStudent?.rut || null,
        targetName: targetStudent?.name || null,
        details: detailsJson,
        note: note ? String(note).trim() : null,
      }
    });

    return created;
  } catch (error) {
    console.error('[logAssignmentAction error]:', error);
    // No interrumpir la operación principal si falla la inserción de log
    return null;
  }
}

/**
 * Obtiene el historial completo de auditoría de una asignación.
 * @param {number} assignmentId 
 */
async function getAssignmentLogs(assignmentId) {
  const parsedId = parseInt(assignmentId, 10);
  if (isNaN(parsedId)) return [];

  return await prisma.assignmentActionLog.findMany({
    where: { assignmentId: parsedId },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Obtiene los bloques de horario de campana escolar.
 * Si no hay ninguno creado, auto-inicializa los bloques estándar del colegio.
 */
async function getSchoolBellBlocks() {
  const blocks = await prisma.schoolBellBlock.findMany({
    where: { isActive: true },
    orderBy: { orderIndex: 'asc' }
  });

  if (blocks.length > 0) return blocks;

  // Semilla de bloques estándar si la tabla está vacía
  const defaultBlocks = [
    { name: 'Bloque 1', startTime: '08:15', endTime: '09:45', orderIndex: 1 },
    { name: 'Bloque 2', startTime: '10:00', endTime: '11:30', orderIndex: 2 },
    { name: 'Bloque 3', startTime: '11:45', endTime: '13:15', orderIndex: 3 },
    { name: 'Bloque 4 (Tarde)', startTime: '14:00', endTime: '15:30', orderIndex: 4 },
    { name: 'Bloque 5 (Tarde)', startTime: '15:45', endTime: '17:15', orderIndex: 5 },
  ];

  for (const b of defaultBlocks) {
    await prisma.schoolBellBlock.create({ data: b });
  }

  return await prisma.schoolBellBlock.findMany({
    where: { isActive: true },
    orderBy: { orderIndex: 'asc' }
  });
}

module.exports = {
  logAssignmentAction,
  getAssignmentLogs,
  getSchoolBellBlocks
};
