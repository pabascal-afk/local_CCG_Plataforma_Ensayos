const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const auditoria = require('../services/auditoria');

// Acceso restringido exclusivamente a Administración y Dirección/Coordinación
router.use(requireAuth, requireRole('ADMIN', 'DIRECTOR'));

const checkAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'Solo los administradores pueden ejecutar la purga de registros históricos.',
    });
  }
  next();
};

// GET /api/auditoria -> Consulta paginada con filtros combinables
router.get('/', async (req, res) => {
  try {
    const resultado = await auditoria.consultarLogs(req.query);
    res.json(resultado);
  } catch (err) {
    console.error('[API Auditoría /]:', err);
    res.status(500).json({ error: err.message || 'Error al consultar registros de auditoría' });
  }
});

// GET /api/auditoria/kpis -> Tarjetas métricas de resumen y filtros disponibles
router.get('/kpis', async (req, res) => {
  try {
    const kpis = await auditoria.obtenerKpisAuditoria();
    res.json(kpis);
  } catch (err) {
    console.error('[API Auditoría /kpis]:', err);
    res.status(500).json({ error: err.message || 'Error al obtener métricas de auditoría' });
  }
});

// GET /api/auditoria/exportar -> Exportación al vuelo en .xlsx o .csv (UTF-8 BOM)
router.get('/exportar', async (req, res) => {
  try {
    const formato = String(req.query.formato || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
    const exportado = await auditoria.exportarLogs({
      ...req.query,
      formato,
    });

    res.setHeader('Content-Type', exportado.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportado.filename}"`);
    res.setHeader('Content-Length', exportado.buffer.length);
    res.send(exportado.buffer);

    auditoria.registrarAuditoria({
      req,
      modulo: 'Auditoría',
      accion: 'Exportar Reporte',
      nivel: 'info',
      entidad: 'Logs de Auditoría',
      descripcion: `Exportó ${exportado.totalExported} registro(s) de auditoría en formato ${formato.toUpperCase()}`,
      detalles: {
        formato,
        totalExportado: exportado.totalExported,
        filtros: {
          desde: req.query.desde || null,
          hasta: req.query.hasta || null,
          modulo: req.query.modulo || null,
          accion: req.query.accion || null,
          nivel: req.query.nivel || null,
          origen_actor: req.query.origen_actor || null,
          busqueda: req.query.busqueda || req.query.buscar || null,
        },
      },
    });
  } catch (err) {
    console.error('[API Auditoría /exportar]:', err);
    res.status(500).json({ error: err.message || 'Error al exportar registros de auditoría' });
  }
});

// GET /api/auditoria/:id -> Detalle específico con JSON estructurado
router.get('/:id', async (req, res) => {
  try {
    const log = await auditoria.obtenerLogPorId(req.params.id);
    if (log && log.invalidId) {
      return res.status(400).json({ error: 'ID de registro inválido' });
    }
    if (!log) {
      return res.status(404).json({ error: 'Registro de auditoría no encontrado' });
    }
    res.json(log);
  } catch (err) {
    console.error('[API Auditoría /:id]:', err);
    res.status(500).json({ error: err.message || 'Error al obtener el detalle del registro' });
  }
});

// POST /api/auditoria/limpiar -> Purgado en bloque según política de retención (solo ADMIN)
router.post('/limpiar', checkAdmin, async (req, res) => {
  try {
    const rawDias = req.body?.dias;
    const dias = rawDias === undefined || rawDias === null || rawDias === '' ? 180 : parseInt(rawDias, 10);
    if (isNaN(dias) || dias < 1 || dias > 3650) {
      return res.status(400).json({ error: 'El número de días de retención debe estar entre 1 y 3650.' });
    }

    const { eliminados, cutoff } = await auditoria.limpiarLogsAntiguos(dias);

    // La purga se auto-registra obligatoriamente como log crítico
    auditoria.registrarAuditoria({
      req,
      modulo: 'Auditoría',
      accion: 'Limpieza Logs',
      nivel: 'danger',
      entidad: 'Logs de Auditoría',
      descripcion: `Purgó ${eliminados} registro(s) históricos con más de ${dias} días de antigüedad`,
      detalles: { diasRetencion: dias, eliminados, fechaCorte: cutoff },
    });

    res.json({
      success: true,
      eliminados,
      dias,
      cutoff,
      message: `Se depuraron ${eliminados} registro(s) anteriores a ${dias} días.`,
    });
  } catch (err) {
    console.error('[API Auditoría /limpiar]:', err);
    res.status(500).json({ error: err.message || 'Error al depurar registros antiguos' });
  }
});

module.exports = router;
