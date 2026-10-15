const express = require('express');
const path = require('path');
const fs = require('fs');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDeadline, finalizeSubmission } = require('../services/submissions');
const { computeResults } = require('../services/grading');

const router = express.Router();
router.use(requireAuth, requireRole('STUDENT'));

const OPTIONS = ['A', 'B', 'C', 'D', 'E'];

/** Busca una asignación verificando que pertenece al curso del alumno. */
async function getOwnAssignment(req, assignmentId) {
  const student = await prisma.user.findUnique({ where: { rut: req.user.rut } });
  if (!student?.courseId) return null;
  return prisma.examAssignment.findFirst({
    where: { id: assignmentId, courseId: student.courseId },
    include: { exam: true },
  });
}

/** Busca un intento verificando que es del alumno autenticado. */
async function getOwnSubmission(req, submissionId) {
  return prisma.submission.findFirst({
    where: { id: submissionId, studentRut: req.user.rut },
    include: { assignment: { include: { exam: true } } },
  });
}

function assignmentState(a, submission, now = new Date()) {
  if (submission?.status === 'SUBMITTED') return a.released ? 'RESULTS' : 'SUBMITTED';
  if (a.applicationMode === 'PRINTED') return 'PRINTED';
  if (now < a.opensAt) return 'UPCOMING';
  if (now > a.closesAt) return submission ? 'SUBMITTED' : 'MISSED';
  return submission ? 'IN_PROGRESS' : 'AVAILABLE';
}

// GET /api/student/assignments
router.get('/assignments', async (req, res) => {
  const student = await prisma.user.findUnique({ where: { rut: req.user.rut } });
  if (!student?.courseId) return res.json([]);

  const assignments = await prisma.examAssignment.findMany({
    where: { courseId: student.courseId },
    include: {
      exam: { select: { id: true, title: true, subject: true, durationMinutes: true, _count: { select: { questions: true } } } },
      submissions: { where: { studentRut: req.user.rut } },
    },
    orderBy: { opensAt: 'desc' },
  });

  res.json(assignments.map((a) => {
    const submission = a.submissions[0] || null;
    return {
      id: a.id,
      opensAt: a.opensAt,
      closesAt: a.closesAt,
      released: a.released,
      applicationMode: a.applicationMode || 'DIGITAL',
      exam: { ...a.exam, questionCount: a.exam._count.questions, _count: undefined },
      state: assignmentState(a, submission),
      submissionId: submission?.id ?? null,
    };
  }));
});

// POST /api/student/assignments/:id/start  -> crea o retoma el intento
router.post('/assignments/:id/start', async (req, res) => {
  const assignment = await getOwnAssignment(req, Number(req.params.id));
  if (!assignment) return res.status(404).json({ error: 'Ensayo no encontrado' });

  if (assignment.applicationMode === 'PRINTED') {
    return res.status(403).json({ error: 'Esta evaluación está configurada para rendición impresa en papel. Tu profesor o el colegio aplicará la hoja de respuestas física.' });
  }

  const now = new Date();
  let submission = await prisma.submission.findUnique({
    where: { studentRut_assignmentId: { studentRut: req.user.rut, assignmentId: assignment.id } },
  });

  if (submission?.status === 'SUBMITTED') {
    return res.status(409).json({ error: 'Ya entregaste este ensayo', submissionId: submission.id });
  }
  if (!submission) {
    if (now < assignment.opensAt) return res.status(403).json({ error: 'Este ensayo aún no está disponible' });
    if (now > assignment.closesAt) return res.status(403).json({ error: 'Este ensayo ya cerró' });
    try {
      submission = await prisma.submission.create({
        data: { studentRut: req.user.rut, assignmentId: assignment.id },
      });
    } catch {
      // Doble clic / dos pestañas: el intento ya fue creado por otra petición
      submission = await prisma.submission.findUnique({
        where: { studentRut_assignmentId: { studentRut: req.user.rut, assignmentId: assignment.id } },
      });
    }
  }

  const deadline = getDeadline(submission, assignment, assignment.exam);
  if (now > deadline) {
    const closed = await finalizeSubmission(submission.id, { auto: true });
    return res.status(409).json({ error: 'El tiempo de este ensayo terminó', submissionId: closed.id });
  }

  const [questions, answers] = await Promise.all([
    prisma.question.findMany({
      where: { examId: assignment.examId },
      select: { id: true, questionNumber: true }, // ¡nunca la pauta!
      orderBy: { questionNumber: 'asc' },
    }),
    prisma.submissionAnswer.findMany({
      where: { submissionId: submission.id },
      select: { questionId: true, selectedAnswer: true },
    }),
  ]);

  res.json({
    submissionId: submission.id,
    assignmentId: assignment.id,
    exam: {
      id: assignment.exam.id,
      title: assignment.exam.title,
      subject: assignment.exam.subject,
      optionsCount: assignment.exam.optionsCount,
    },
    questions,
    answers: Object.fromEntries(answers.map((a) => [a.questionId, a.selectedAnswer])),
    serverNow: now.toISOString(),
    deadline: deadline.toISOString(),
  });
});

// GET /api/student/assignments/:id/pdf  -> PDF privado (solo alumnos del curso, ventana abierta)
router.get('/assignments/:id/pdf', async (req, res) => {
  const assignment = await getOwnAssignment(req, Number(req.params.id));
  if (!assignment) return res.status(404).json({ error: 'Ensayo no encontrado' });

  const submission = await prisma.submission.findUnique({
    where: { studentRut_assignmentId: { studentRut: req.user.rut, assignmentId: assignment.id } },
  });
  if (!submission || submission.status !== 'IN_PROGRESS') {
    return res.status(403).json({ error: 'El ensayo no está en curso' });
  }

  const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
  const filePath = path.join(uploadsDir, path.basename(assignment.exam.pdfPath));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo PDF no encontrado' });

  // sendFile soporta peticiones por rangos (Range), así pdf.js descarga por partes.
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath);
});

const answersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.number().int(),
    selectedAnswer: z.enum(['A', 'B', 'C', 'D', 'E']).nullable(),
  })).min(1).max(200),
});

// PUT /api/student/submissions/:id/answers  -> autoguardado (acepta lote para reintentos sin conexión)
router.put('/submissions/:id/answers', async (req, res) => {
  const parsed = answersSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Formato de respuestas inválido' });

  const submission = await getOwnSubmission(req, Number(req.params.id));
  if (!submission) return res.status(404).json({ error: 'Intento no encontrado' });
  if (submission.status !== 'IN_PROGRESS') return res.status(409).json({ error: 'El ensayo ya fue entregado' });

  const { assignment } = submission;
  const exam = assignment.exam;
  const deadline = getDeadline(submission, assignment, exam);
  // 30 s de gracia para respuestas en vuelo justo al terminar el tiempo
  if (Date.now() > deadline.getTime() + 30 * 1000) {
    await finalizeSubmission(submission.id, { auto: true });
    return res.status(409).json({ error: 'El tiempo terminó; tu ensayo fue entregado' });
  }

  const validQuestionIds = new Set(
    (await prisma.question.findMany({ where: { examId: exam.id }, select: { id: true } })).map((q) => q.id)
  );
  const allowed = OPTIONS.slice(0, exam.optionsCount);

  for (const a of parsed.data.answers) {
    if (!validQuestionIds.has(a.questionId)) return res.status(400).json({ error: 'Pregunta inválida' });
    if (a.selectedAnswer && !allowed.includes(a.selectedAnswer)) {
      return res.status(400).json({ error: 'Alternativa inválida' });
    }
  }

  await prisma.$transaction(parsed.data.answers.map((a) => {
    const where = { submissionId_questionId: { submissionId: submission.id, questionId: a.questionId } };
    if (a.selectedAnswer === null) {
      return prisma.submissionAnswer.deleteMany({ where: { submissionId: submission.id, questionId: a.questionId } });
    }
    return prisma.submissionAnswer.upsert({
      where,
      update: { selectedAnswer: a.selectedAnswer },
      create: { submissionId: submission.id, questionId: a.questionId, selectedAnswer: a.selectedAnswer },
    });
  }));

  res.json({ saved: parsed.data.answers.length, savedAt: new Date().toISOString() });
});

// POST /api/student/submissions/:id/submit
router.post('/submissions/:id/submit', async (req, res) => {
  const submission = await getOwnSubmission(req, Number(req.params.id));
  if (!submission) return res.status(404).json({ error: 'Intento no encontrado' });
  if (submission.status === 'SUBMITTED') return res.json({ message: 'El ensayo ya estaba entregado' });

  await finalizeSubmission(submission.id);
  // No se devuelve la nota: el profesor debe liberar los resultados.
  res.json({ message: 'Ensayo entregado correctamente' });
});

// GET /api/student/submissions/:id/result  -> solo si el profesor liberó los resultados
router.get('/submissions/:id/result', async (req, res) => {
  const submission = await getOwnSubmission(req, Number(req.params.id));
  if (!submission) return res.status(404).json({ error: 'Intento no encontrado' });
  if (submission.status !== 'SUBMITTED') return res.status(409).json({ error: 'El ensayo aún no se entrega' });
  if (!submission.assignment.released) {
    return res.status(403).json({ error: 'Tu profesor aún no publica los resultados' });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: submission.assignment.examId },
    include: { questions: true },
  });
  const answers = await prisma.submissionAnswer.findMany({ where: { submissionId: submission.id } });
  const results = computeResults(
    exam.questions,
    Object.fromEntries(answers.map((a) => [a.questionId, a.selectedAnswer])),
    exam
  );

  // No se incluye la pauta ni el detalle por pregunta (evita que circule entre cursos).
  res.json({
    exam: { title: exam.title, subject: exam.subject },
    submittedAt: submission.submittedAt,
    correctCount: submission.correctCount,
    total: results.total,
    percent: submission.percent,
    grade: submission.grade,
    achievementLevel: submission.achievementLevel,
    simceScore: submission.simceScore ?? results.simceScore,
    theta: submission.theta ?? results.theta,
    bySkill: results.bySkill,
    byAxis: results.byAxis,
  });
});

// GET /api/student/trajectory -> evolución longitudinal de todos los ensayos rendidos
router.get('/trajectory', async (req, res) => {
  const student = await prisma.user.findUnique({
    where: { rut: req.user.rut },
    include: { course: true }
  });
  if (!student) return res.status(404).json({ error: 'Estudiante no encontrado' });

  const submissions = await prisma.submission.findMany({
    where: {
      studentRut: req.user.rut,
      status: 'SUBMITTED',
      assignment: { released: true } // solo ensayos con resultados liberados
    },
    include: {
      assignment: {
        include: { exam: true }
      }
    },
    orderBy: { submittedAt: 'asc' }
  });

  const trajectory = submissions.map((s) => ({
    id: s.id,
    assignmentId: s.assignmentId,
    examTitle: s.assignment.exam.title,
    subject: s.assignment.exam.subject,
    date: s.submittedAt,
    grade: s.grade,
    percent: s.percent,
    simceScore: s.simceScore,
    level: s.achievementLevel,
  }));

  res.json({
    student: {
      rut: student.rut,
      name: student.name,
      courseName: student.course ? `${student.course.level.replace('B', '° Básico').replace('M', '° Medio')} ${student.course.letter}` : ''
    },
    trajectory
  });
});

module.exports = router;
