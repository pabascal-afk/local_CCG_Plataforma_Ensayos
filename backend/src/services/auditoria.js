const exceljs = require('exceljs');
const { prisma, ensureAuditTableSchema } = require('../lib/prisma');

const VALID_LEVELS = new Set(['info', 'success', 'warning', 'danger']);
const pendingWrites = new Set();

function normalizeLevel(nivel) {
  const n = String(nivel || 'info').trim().toLowerCase();
  if (n === 'error') return 'danger';
  if (n === 'warn') return 'warning';
  return VALID_LEVELS.has(n) ? n : 'info';
}

function normalizeUserObject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.rut || raw.id || null;
  const email = raw.email || (id ? String(id) : null);
  const name = raw.name || raw.nombre || (id ? String(id) : null);
  const role = raw.role || raw.rol || null;
  if (!id && !email && !name && !role) return null;
  return {
    id: id ? String(id) : null,
    email: email ? String(email) : null,
    name: name ? String(name) : null,
    role: role ? String(role) : null,
  };
}

function extractRequestContext(req) {
  if (!req || typeof req !== 'object') {
    return {
      reqUser: null,
      ip: '127.0.0.1',
      userAgent: 'Node.js / Local',
    };
  }

  let reqUser = null;
  if (req.user) {
    reqUser = normalizeUserObject(req.user);
  } else if (req.session && req.session.passport && req.session.passport.user) {
    reqUser = normalizeUserObject(req.session.passport.user);
  }

  const headers = req.headers || {};
  const xForwarded = headers['x-forwarded-for'];
  let ip = '127.0.0.1';
  if (xForwarded) {
    ip = String(xForwarded).split(',')[0].trim();
  } else {
    ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
  }
  ip = String(ip || '127.0.0.1');
  if (ip.includes('::ffff:')) ip = ip.replace('::ffff:', '');
  if (ip === '::1') ip = '127.0.0.1';

  const rawUa = headers['user-agent'] ? String(headers['user-agent']).trim() : 'Desconocido';
  const userAgent = rawUa.length > 500 ? `${rawUa.slice(0, 497)}...` : rawUa;

  return { reqUser, ip, userAgent };
}

function mapLogToDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    fecha_hora: row.fechaHora instanceof Date ? row.fechaHora.toISOString() : row.fechaHora,
    origen_actor: row.origenActor || 'USUARIO',
    usuario_id: row.usuarioId ?? null,
    usuario_email: row.usuarioEmail,
    usuario_nombre: row.usuarioNombre ?? null,
    usuario_rol: row.usuarioRol ?? null,
    desencadenado_por_id: row.desencadenadoPorId ?? null,
    desencadenado_por_nombre: row.desencadenadoPorNombre ?? null,
    desencadenado_por_rol: row.desencadenadoPorRol ?? null,
    modulo: row.modulo,
    accion: row.accion,
    nivel: row.nivel || 'info',
    entidad: row.entidad ?? null,
    entidad_id: row.entidadId ?? null,
    descripcion: row.descripcion,
    detalles: row.detalles ?? null,
    ip: row.ip ?? null,
    user_agent: row.userAgent ?? null,
  };
}

function buildWhereClause(query = {}) {
  const {
    desde = null,
    hasta = null,
    modulo = 'todos',
    accion = 'todos',
    nivel = 'todos',
    origen_actor = 'todos',
    origenActor = '',
    usuario = '',
    busqueda = '',
    buscar = '',
    q: queryQ = '',
  } = query;

  const andConditions = [];

  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(String(desde).trim())) {
    const startDate = new Date(`${String(desde).trim()}T00:00:00.000`);
    if (!isNaN(startDate.getTime())) {
      andConditions.push({ fechaHora: { gte: startDate } });
    }
  }

  if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(hasta).trim())) {
    const endDate = new Date(`${String(hasta).trim()}T23:59:59.999`);
    if (!isNaN(endDate.getTime())) {
      andConditions.push({ fechaHora: { lte: endDate } });
    }
  }

  if (modulo && modulo !== 'todos') {
    andConditions.push({ modulo: String(modulo).trim() });
  }

  if (accion && accion !== 'todos') {
    andConditions.push({ accion: String(accion).trim() });
  }

  if (nivel && nivel !== 'todos') {
    andConditions.push({ nivel: normalizeLevel(nivel) });
  }

  const effectiveOrigin = String(origenActor || origen_actor || '').trim().toUpperCase();
  if (effectiveOrigin && effectiveOrigin !== 'TODOS') {
    andConditions.push({ origenActor: effectiveOrigin });
  }

  if (usuario && String(usuario).trim()) {
    const uTerm = String(usuario).trim();
    andConditions.push({
      OR: [
        { usuarioId: { contains: uTerm } },
        { usuarioEmail: { contains: uTerm } },
        { usuarioNombre: { contains: uTerm } },
        { desencadenadoPorId: { contains: uTerm } },
        { desencadenadoPorNombre: { contains: uTerm } },
      ],
    });
  }

  const textoBusqueda = String(busqueda || buscar || queryQ || '').trim();
  if (textoBusqueda) {
    andConditions.push({
      OR: [
        { descripcion: { contains: textoBusqueda } },
        { modulo: { contains: textoBusqueda } },
        { accion: { contains: textoBusqueda } },
        { entidad: { contains: textoBusqueda } },
        { entidadId: { contains: textoBusqueda } },
        { usuarioNombre: { contains: textoBusqueda } },
        { usuarioEmail: { contains: textoBusqueda } },
        { usuarioId: { contains: textoBusqueda } },
        { desencadenadoPorNombre: { contains: textoBusqueda } },
        { desencadenadoPorId: { contains: textoBusqueda } },
        { ip: { contains: textoBusqueda } },
        { detalles: { contains: textoBusqueda } },
      ],
    });
  }

  return andConditions.length > 0 ? { AND: andConditions } : {};
}

async function inicializarTablaAuditoria() {
  await ensureAuditTableSchema();
}

/**
 * Registra un evento de auditoría de forma asíncrona y no bloqueante (fire-and-forget).
 * Cuando `esPlataforma` es true (o la acción ocurre de forma automática sin usuario directo),
 * identifica a "Plataforma Automática" como ejecutor y preserva en `desencadenado_por_*`
 * la identidad del usuario que desencadenó la operación.
 */
function registrarAuditoria({
  req = null,
  usuario = null,
  esPlataforma = false,
  desencadenadoPor = null,
  modulo = 'General',
  accion = 'Acción',
  nivel = 'info',
  entidad = null,
  entidad_id = null,
  descripcion = '',
  detalles = null,
}) {
  const { reqUser, ip, userAgent } = extractRequestContext(req);
  const explicitUser = normalizeUserObject(usuario);
  const explicitTrigger = normalizeUserObject(desencadenadoPor);

  const actorHumano = explicitUser || reqUser;
  const isPlatformExecution = Boolean(esPlataforma) || !actorHumano;

  let origenActorFinal = 'USUARIO';
  let usuarioId = null;
  let usuarioEmail = 'sistema@colegiocerrogrande.cl';
  let usuarioNombre = 'Sistema Automático';
  let usuarioRol = 'SISTEMA';
  let triggerId = null;
  let triggerNombre = null;
  let triggerRol = null;

  if (isPlatformExecution) {
    origenActorFinal = 'PLATAFORMA';
    usuarioId = 'PLATAFORMA';
    usuarioEmail = 'plataforma@colegiocerrogrande.cl';
    usuarioNombre = 'Plataforma Automática';
    usuarioRol = 'SISTEMA';

    const trigger = explicitTrigger || actorHumano;
    if (trigger) {
      triggerId = trigger.id || trigger.email || null;
      triggerNombre = trigger.name || trigger.id || trigger.email || 'Usuario';
      triggerRol = trigger.role || 'USUARIO';
    } else {
      triggerId = 'SISTEMA';
      triggerNombre = 'Proceso Programado / Sistema';
      triggerRol = 'SISTEMA';
    }
  } else {
    origenActorFinal = 'USUARIO';
    usuarioId = actorHumano.id || null;
    usuarioEmail = actorHumano.email || actorHumano.id || 'usuario@colegiocerrogrande.cl';
    usuarioNombre = actorHumano.name || actorHumano.id || 'Usuario';
    usuarioRol = actorHumano.role || 'USER';

    if (explicitTrigger) {
      triggerId = explicitTrigger.id || explicitTrigger.email || null;
      triggerNombre = explicitTrigger.name || explicitTrigger.id || null;
      triggerRol = explicitTrigger.role || null;
    }
  }

  let descFinal = String(descripcion || '').trim();
  if (!descFinal) {
    descFinal = isPlatformExecution
      ? `La plataforma ejecutó "${accion}" en ${modulo}${entidad ? ` (${entidad})` : ''}`
      : `${accion} en ${modulo}${entidad ? ` (${entidad})` : ''}`;
  }
  if (isPlatformExecution && triggerNombre && triggerId !== 'SISTEMA') {
    const alreadyMentionsTrigger =
      descFinal.toLowerCase().includes(triggerNombre.toLowerCase()) ||
      (triggerId && descFinal.toLowerCase().includes(String(triggerId).toLowerCase()));
    if (!alreadyMentionsTrigger) {
      descFinal = `${descFinal} (desencadenado por ${triggerNombre}${triggerId ? ` · ${triggerId}` : ''})`;
    }
  }

  let detallesPayload = detalles;
  if (isPlatformExecution) {
    const traceMeta = {
      ejecutado_por: 'Plataforma Automática',
      desencadenado_por: triggerId
        ? { id: triggerId, nombre: triggerNombre, rol: triggerRol }
        : null,
    };
    if (detallesPayload && typeof detallesPayload === 'object' && !Array.isArray(detallesPayload)) {
      detallesPayload = { ...detallesPayload, _plataforma: traceMeta };
    } else if (detallesPayload === null || detallesPayload === undefined) {
      detallesPayload = { _plataforma: traceMeta };
    } else {
      detallesPayload = { valor: detallesPayload, _plataforma: traceMeta };
    }
  }

  let detallesJson = null;
  if (detallesPayload !== null && detallesPayload !== undefined) {
    if (typeof detallesPayload === 'string') {
      detallesJson = detallesPayload;
    } else {
      try {
        detallesJson = JSON.stringify(detallesPayload);
      } catch {
        detallesJson = JSON.stringify({ error_serializacion: String(detallesPayload) });
      }
    }
  }

  const data = {
    origenActor: origenActorFinal,
    usuarioId: usuarioId !== null && usuarioId !== undefined ? String(usuarioId) : null,
    usuarioEmail: String(usuarioEmail),
    usuarioNombre: usuarioNombre ? String(usuarioNombre) : null,
    usuarioRol: usuarioRol ? String(usuarioRol) : null,
    desencadenadoPorId: triggerId ? String(triggerId) : null,
    desencadenadoPorNombre: triggerNombre ? String(triggerNombre) : null,
    desencadenadoPorRol: triggerRol ? String(triggerRol) : null,
    modulo: String(modulo || 'General'),
    accion: String(accion || 'Acción'),
    nivel: normalizeLevel(nivel),
    entidad: entidad ? String(entidad) : null,
    entidadId: entidad_id !== null && entidad_id !== undefined && String(entidad_id).trim() !== ''
      ? String(entidad_id)
      : null,
    descripcion: descFinal,
    detalles: detallesJson,
    ip,
    userAgent,
  };

  setImmediate(() => {
    const p = (async () => {
      try {
        await ensureAuditTableSchema();
        await prisma.auditLog.create({ data });
      } catch (err) {
        if (process.env.NODE_ENV !== 'test') {
          console.error('[AUDITORIA] Error registrando log:', err?.message || err);
        }
      }
    })();

    pendingWrites.add(p);
    p.finally(() => {
      pendingWrites.delete(p);
    });
  });
}

/**
 * Permite esperar en tests a que finalicen las escrituras encoladas por setImmediate().
 */
async function flushAuditoria() {
  await new Promise((resolve) => setImmediate(resolve));
  while (pendingWrites.size > 0) {
    await Promise.allSettled(Array.from(pendingWrites));
  }
}

async function consultarLogs(query = {}) {
  await ensureAuditTableSchema();
  const page = Math.max(1, parseInt(query.page || query.pagina, 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(query.limit || query.limite, 10) || 25));
  const skip = (page - 1) * limit;
  const where = buildWhereClause(query);

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;
  const items = rows.map(mapLogToDto);

  return {
    total,
    page,
    pagina: page,
    limit,
    limite: limit,
    totalPages,
    totalPaginas: totalPages,
    items,
    logs: items,
  };
}

async function obtenerKpisAuditoria() {
  await ensureAuditTableSchema();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const [total, hoy, criticos, plataformaTotal, groupedModules, groupedActions] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({
      where: {
        fechaHora: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
    }),
    prisma.auditLog.count({
      where: {
        OR: [
          { nivel: 'danger' },
          { accion: { in: ['Eliminar', 'Rechazar', 'Rechazar Remedial', 'Limpieza Logs', 'Cancelar'] } },
        ],
      },
    }),
    prisma.auditLog.count({
      where: { origenActor: 'PLATAFORMA' },
    }),
    prisma.auditLog.groupBy({
      by: ['modulo'],
      _count: { modulo: true },
      orderBy: { _count: { modulo: 'desc' } },
    }),
    prisma.auditLog.groupBy({
      by: ['accion'],
      _count: { accion: true },
      orderBy: { _count: { accion: 'desc' } },
    }),
  ]);

  const topMod = groupedModules && groupedModules.length > 0 ? groupedModules[0] : null;
  const modNombre = topMod ? topMod.modulo : null;
  const modCant = topMod ? topMod._count.modulo : 0;

  return {
    total_general: total,
    total_hoy: hoy,
    acciones_criticas: criticos,
    acciones_plataforma: plataformaTotal,
    modulo_mas_activo: modNombre ? `${modNombre} (${modCant})` : 'Sin actividad',
    total,
    hoy,
    criticos,
    plataformaTotal,
    moduloLider: modNombre ? { modulo: modNombre, total: modCant } : null,
    modulosDisponibles: groupedModules.map((g) => g.modulo).filter(Boolean),
    accionesDisponibles: groupedActions.map((g) => g.accion).filter(Boolean),
  };
}

async function obtenerLogPorId(id) {
  await ensureAuditTableSchema();
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId) || parsedId <= 0) return { invalidId: true };

  const row = await prisma.auditLog.findUnique({ where: { id: parsedId } });
  if (!row) return null;

  const dto = mapLogToDto(row);
  let detallesParsed = null;
  if (dto.detalles) {
    try {
      detallesParsed = JSON.parse(dto.detalles);
    } catch {
      detallesParsed = dto.detalles;
    }
  }

  return {
    ...dto,
    detalles_parsed: detallesParsed,
  };
}

function escapeCsvCell(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatLocalDateTime(dt) {
  if (!dt) return '';
  try {
    return new Date(dt).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(dt);
  }
}

async function exportarLogs(query = {}) {
  await ensureAuditTableSchema();
  const formato = String(query.formato || 'xlsx').trim().toLowerCase();
  const where = buildWhereClause(query);

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 50000,
  });

  const exportRows = rows.map((r) => ({
    id: r.id,
    fechaLocal: formatLocalDateTime(r.fechaHora),
    origenActor: r.origenActor === 'PLATAFORMA' ? 'Plataforma Automática' : 'Usuario',
    usuarioNombre: r.usuarioNombre || '',
    usuarioIdEmail: r.usuarioEmail || r.usuarioId || '',
    usuarioRol: r.usuarioRol || '',
    desencadenadoPor: r.desencadenadoPorNombre
      ? `${r.desencadenadoPorNombre}${r.desencadenadoPorId && r.desencadenadoPorId !== r.desencadenadoPorNombre ? ` (${r.desencadenadoPorId})` : ''}`
      : (r.origenActor === 'USUARIO' ? 'Acción directa' : ''),
    desencadenadoPorRol: r.desencadenadoPorRol || '',
    modulo: r.modulo || '',
    accion: r.accion || '',
    nivel: String(r.nivel || 'info').toUpperCase(),
    entidad: r.entidad ? `${r.entidad}${r.entidadId ? ` #${r.entidadId}` : ''}` : '',
    descripcion: r.descripcion || '',
    ip: r.ip || '',
    userAgent: r.userAgent || '',
    detalles: r.detalles || '',
  }));

  const dateTag = new Date().toISOString().slice(0, 10);

  if (formato === 'csv') {
    const headers = [
      'ID',
      'Fecha y Hora (Local)',
      'Origen Ejecutor',
      'Ejecutor / Usuario',
      'ID / Identificador',
      'Rol',
      'Usuario que Desencadenó',
      'Rol Desencadenante',
      'Módulo',
      'Acción',
      'Nivel',
      'Entidad Afectada',
      'Descripción de la Acción',
      'Dirección IP',
      'Navegador / Dispositivo',
      'Detalles Técnicos (JSON)',
    ];
    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...exportRows.map((r) =>
        [
          r.id,
          r.fechaLocal,
          r.origenActor,
          r.usuarioNombre,
          r.usuarioIdEmail,
          r.usuarioRol,
          r.desencadenadoPor,
          r.desencadenadoPorRol,
          r.modulo,
          r.accion,
          r.nivel,
          r.entidad,
          r.descripcion,
          r.ip,
          r.userAgent,
          r.detalles,
        ]
          .map(escapeCsvCell)
          .join(',')
      ),
    ];

    return {
      buffer: Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf-8'),
      mimeType: 'text/csv; charset=utf-8',
      filename: `auditoria_plataforma_${dateTag}.csv`,
      totalExported: exportRows.length,
    };
  }

  const workbook = new exceljs.Workbook();
  workbook.creator = 'Colegio Cerro Grande';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Auditoría de Plataforma', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Fecha y Hora (Local)', key: 'fechaLocal', width: 22 },
    { header: 'Origen Ejecutor', key: 'origenActor', width: 22 },
    { header: 'Ejecutor / Usuario', key: 'usuarioNombre', width: 26 },
    { header: 'ID / Identificador', key: 'usuarioIdEmail', width: 24 },
    { header: 'Rol', key: 'usuarioRol', width: 14 },
    { header: 'Usuario que Desencadenó', key: 'desencadenadoPor', width: 28 },
    { header: 'Rol Desencadenante', key: 'desencadenadoPorRol', width: 18 },
    { header: 'Módulo', key: 'modulo', width: 18 },
    { header: 'Acción', key: 'accion', width: 24 },
    { header: 'Nivel', key: 'nivel', width: 12 },
    { header: 'Entidad Afectada', key: 'entidad', width: 26 },
    { header: 'Descripción de la Acción', key: 'descripcion', width: 62 },
    { header: 'Dirección IP', key: 'ip', width: 16 },
    { header: 'Navegador / Dispositivo', key: 'userAgent', width: 34 },
    { header: 'Detalles Técnicos (JSON)', key: 'detalles', width: 46 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 24;

  for (const rowData of exportRows) {
    sheet.addRow(rowData);
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `auditoria_plataforma_${dateTag}.xlsx`,
    totalExported: exportRows.length,
  };
}

async function limpiarLogsAntiguos(dias = 180) {
  await ensureAuditTableSchema();
  const parsedDias = parseInt(dias, 10);
  if (isNaN(parsedDias) || parsedDias < 1) {
    throw new Error('La cantidad de días debe ser un número entero mayor o igual a 1');
  }
  const cutoff = new Date(Date.now() - parsedDias * 24 * 60 * 60 * 1000);
  const res = await prisma.auditLog.deleteMany({
    where: {
      fechaHora: { lt: cutoff },
    },
  });
  return {
    eliminados: res.count || 0,
    dias: parsedDias,
    cutoff: cutoff.toISOString(),
  };
}

module.exports = {
  inicializarTablaAuditoria,
  registrarAuditoria,
  flushAuditoria,
  consultarLogs,
  obtenerKpisAuditoria,
  obtenerLogPorId,
  exportarLogs,
  limpiarLogsAntiguos,
  extractRequestContext,
};
