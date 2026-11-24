const { prisma } = require('../lib/prisma');
const { logAssignmentAction } = require('./assignmentLog');
const auditoria = require('./auditoria');

const SETTING_KEY_ENABLED = 'auto_archive_enabled';
const SETTING_KEY_DAYS = 'auto_archive_days';
const DEFAULT_DAYS = 30;

/**
 * Obtener configuración actual del sistema de archivado
 */
async function getArchiveSettings() {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: [SETTING_KEY_ENABLED, SETTING_KEY_DAYS] } }
    });

    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));

    const enabled = map[SETTING_KEY_ENABLED] !== undefined 
      ? map[SETTING_KEY_ENABLED] === 'true' 
      : true; // Por defecto activo

    const parsedDays = parseInt(map[SETTING_KEY_DAYS], 10);
    const days = !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : DEFAULT_DAYS;

    return { enabled, days };
  } catch (error) {
    console.error('[getArchiveSettings error]:', error);
    return { enabled: true, days: DEFAULT_DAYS };
  }
}

/**
 * Actualizar configuración de auto-archivado
 */
async function updateArchiveSettings({ enabled, days, actor, req }) {
  const boolEnabled = Boolean(enabled);
  const parsedDays = parseInt(days, 10);
  const finalDays = !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : DEFAULT_DAYS;

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_ENABLED },
    update: { value: String(boolEnabled), updatedBy: actor?.rut || null },
    create: { key: SETTING_KEY_ENABLED, value: String(boolEnabled), updatedBy: actor?.rut || null }
  });

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_DAYS },
    update: { value: String(finalDays), updatedBy: actor?.rut || null },
    create: { key: SETTING_KEY_DAYS, value: String(finalDays), updatedBy: actor?.rut || null }
  });

  auditoria.registrarAuditoria({
    req,
    usuario: actor,
    modulo: 'Configuración',
    accion: 'Configurar Auto-archivado',
    nivel: 'warning',
    entidad: 'Sistema',
    descripcion: `Actualizó auto-archivado: ${boolEnabled ? `Activado (${finalDays} días)` : 'Desactivado'}`,
    detalles: { enabled: boolEnabled, days: finalDays }
  });

  return { enabled: boolEnabled, days: finalDays };
}

/**
 * Ejecutar proceso de archivado automático según los días configurados
 */
async function runAutoArchive(req = null) {
  try {
    const { enabled, days } = await getArchiveSettings();
    if (!enabled || days <= 0) {
      return { count: 0, reason: 'DISABLED' };
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Seleccionar asignaciones no archivadas cuya fecha de cierre ya superó los días estipulados
    const candidates = await prisma.examAssignment.findMany({
      where: {
        isArchived: false,
        status: { not: 'CANCELLED' },
        closesAt: { lte: cutoff }
      },
      select: { id: true, closesAt: true, exam: { select: { title: true } } }
    });

    if (candidates.length === 0) {
      return { count: 0, affectedIds: [] };
    }

    const now = new Date();
    const ids = candidates.map(c => c.id);

    await prisma.examAssignment.updateMany({
      where: { id: { in: ids } },
      data: {
        isArchived: true,
        archivedAt: now,
        archivedBy: 'SISTEMA_AUTO',
        archivedReason: `AUTO_AFTER_${days}_DAYS`
      }
    });

    // Registrar acción de asignación para cada una
    for (const c of candidates) {
      await logAssignmentAction({
        assignmentId: c.id,
        action: 'ASSIGNMENT_ARCHIVED',
        actor: { rut: 'SISTEMA_AUTO', name: 'Sistema Automático' },
        details: { reason: `AUTO_AFTER_${days}_DAYS`, daysThreshold: days, closesAt: c.closesAt }
      }).catch(() => {});
    }

    auditoria.registrarAuditoria({
      req,
      usuario: { rut: 'SISTEMA_AUTO', name: 'Sistema Automático' },
      origenActor: 'PLATAFORMA',
      modulo: 'Asignaciones',
      accion: 'Archivado Automático',
      nivel: 'info',
      entidad: 'Asignaciones',
      descripcion: `Se archivaron automáticamente ${ids.length} asignaciones cerradas hace más de ${days} días`,
      detalles: { count: ids.length, ids, daysThreshold: days }
    });

    return { count: ids.length, affectedIds: ids };
  } catch (error) {
    console.error('[runAutoArchive error]:', error);
    return { count: 0, error: error.message };
  }
}

/**
 * Archivar manualmente una asignación
 */
async function archiveAssignment(id, actor, req = null) {
  const assignment = await prisma.examAssignment.findUnique({
    where: { id: parseInt(id, 10) },
    include: { exam: true, course: true }
  });

  if (!assignment) {
    throw new Error('NOT_FOUND');
  }

  if (assignment.isArchived) {
    return assignment; // Ya archivada
  }

  const now = new Date();
  if (now <= new Date(assignment.closesAt)) {
    const subsCount = await prisma.submission.count({
      where: { assignmentId: assignment.id }
    });
    if (subsCount === 0) {
      const err = new Error('No es posible archivar una evaluación que aún se encuentra en curso');
      err.status = 400;
      throw err;
    }
  }

  const updated = await prisma.examAssignment.update({
    where: { id: assignment.id },
    data: {
      isArchived: true,
      archivedAt: now,
      archivedBy: actor?.rut || null,
      archivedReason: 'MANUAL'
    },
    include: { exam: true, course: true }
  });

  await logAssignmentAction({
    assignmentId: assignment.id,
    action: 'ASSIGNMENT_ARCHIVED',
    actor,
    details: {
      reason: 'MANUAL',
      examTitle: assignment.exam?.title,
      courseId: assignment.courseId
    }
  });

  auditoria.registrarAuditoria({
    req,
    usuario: actor,
    modulo: 'Asignaciones',
    accion: 'Archivar Evaluación',
    nivel: 'info',
    entidad: 'Asignación',
    entidad_id: assignment.id,
    descripcion: `Archivó manualmente evaluación #${assignment.id} "${assignment.exam?.title}" para curso ${assignment.course?.level} ${assignment.course?.letter}`,
    detalles: { assignmentId: assignment.id, examTitle: assignment.exam?.title, courseId: assignment.courseId }
  });

  return updated;
}

/**
 * Desarchivar manualmente una asignación (restaurar a activa)
 */
async function unarchiveAssignment(id, actor, req = null) {
  const assignment = await prisma.examAssignment.findUnique({
    where: { id: parseInt(id, 10) },
    include: { exam: true, course: true }
  });

  if (!assignment) {
    throw new Error('NOT_FOUND');
  }

  if (!assignment.isArchived) {
    return assignment; // Ya activa
  }

  const updated = await prisma.examAssignment.update({
    where: { id: assignment.id },
    data: {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      archivedReason: null
    },
    include: { exam: true, course: true }
  });

  await logAssignmentAction({
    assignmentId: assignment.id,
    action: 'ASSIGNMENT_UNARCHIVED',
    actor,
    details: {
      restoredBy: actor?.rut,
      examTitle: assignment.exam?.title,
      courseId: assignment.courseId
    }
  });

  auditoria.registrarAuditoria({
    req,
    usuario: actor,
    modulo: 'Asignaciones',
    accion: 'Desarchivar Evaluación',
    nivel: 'warning',
    entidad: 'Asignación',
    entidad_id: assignment.id,
    descripcion: `Desarchivó evaluación #${assignment.id} "${assignment.exam?.title}" restaurándola a la cola activa`,
    detalles: { assignmentId: assignment.id, examTitle: assignment.exam?.title, courseId: assignment.courseId }
  });

  return updated;
}

module.exports = {
  getArchiveSettings,
  updateArchiveSettings,
  runAutoArchive,
  archiveAssignment,
  unarchiveAssignment
};
