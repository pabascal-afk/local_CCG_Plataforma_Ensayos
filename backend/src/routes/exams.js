const express = require('express');
const path = require('path');
const fs = require('fs');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN', 'DIRECTOR', 'TEACHER'));

// GET /api/exams  -> listado (sin pauta) para el personal del colegio
router.get('/', async (req, res) => {
  const exams = await prisma.exam.findMany({
    orderBy: [{ orderNumber: 'asc' }, { title: 'asc' }],
    include: { _count: { select: { questions: true, assignments: true } } },
  });
  res.json(exams);
});

// GET /api/exams/:id/pdf  -> vista previa del PDF para el personal
router.get('/:id/pdf', async (req, res) => {
  const exam = await prisma.exam.findUnique({ where: { id: Number(req.params.id) } });
  if (!exam) return res.status(404).json({ error: 'Ensayo no encontrado' });

  const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
  const filePath = path.join(uploadsDir, path.basename(exam.pdfPath));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo PDF no encontrado' });

  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath);
});

module.exports = router;
