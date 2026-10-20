const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth, requireRole } = require('../middleware/auth');
const { prisma } = require('../lib/prisma');
const exceljs = require('exceljs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { normalizeRut } = require('../utils/rut');
const { parseSpreadsheet, createEmptyTemplate } = require('../utils/spreadsheet');
const { computeResults, isOpenQuestion, getQuestionMaxPoints } = require('../services/grading');

const router = express.Router();
const uploadMemory = multer({ storage: multer.memoryStorage() });

const uploadAudioDisk = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.mp3';
      cb(null, `audio-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB máx.
  fileFilter: (req, file, cb) => {
    const original = String(file.originalname || '').toLowerCase();
    if (original.endsWith('.wav') || file.mimetype === 'audio/wav' || file.mimetype === 'audio/x-wav') {
      const err = new Error('Los archivos .wav no están permitidos por su gran peso. Por favor sube el audio comprimido en formato MP3 o M4A.');
      err.status = 400;
      return cb(err);
    }
    const isAllowedExt = /\.(mp3|m4a|aac|ogg|oga|webm|opus)$/i.test(original);
    const isAllowedMime = /^audio\/(mpeg|mp3|mp4|x-m4a|aac|ogg|webm|opus)$/i.test(file.mimetype) ||
                          file.mimetype === 'application/octet-stream';
    if (isAllowedExt || isAllowedMime) {
      cb(null, true);
    } else {
      const err = new Error('Formato no soportado. Solo se permiten audios comprimidos (.mp3, .m4a, .aac, .ogg, .webm).');
      err.status = 400;
      cb(err);
    }
  }
});

router.use(requireAuth);
router.use(requireRole('TEACHER', 'ADMIN', 'DIRECTOR'));

/**
 * Helper to get course IDs allowed for the current user.
 * If ADMIN or DIRECTOR, returns undefined (meaning no filter, fetch all).
 * If TEACHER, returns an array of courseIds from TeacherCourse.
 */
async function getAllowedCourseIds(user) {
  if (user.role === 'ADMIN' || user.role === 'DIRECTOR') return undefined;
  const tcs = await prisma.teacherCourse.findMany({
    where: { teacherRut: user.rut },
    select: { courseId: true }
  });
  return tcs.map(t => t.courseId);
}

// ==========================================
// Dashboard
// ==========================================

router.get('/assignments', async (req, res, next) => {
  try {
    const allowedCourses = await getAllowedCourseIds(req.user);
    const where = req.user.role === 'ADMIN' || req.user.role === 'DIRECTOR'
      ? {}
      : { OR: [{ courseId: { in: allowedCourses || [] } }, { assignedTeacherRut: req.user.rut }] };

    const yearFilter = req.query.year ? parseInt(req.query.year, 10) : undefined;
    if (yearFilter) {
      where.course = { year: yearFilter };
    }
    
    const assignments = await prisma.examAssignment.findMany({
      where,
      include: {
        exam: true,
        course: true,
        _count: { select: { submissions: true } }
      },
      orderBy: { opensAt: 'desc' }
    });

    // We also need total students per course to calculate participation
    const courseIds = [...new Set(assignments.map(a => a.courseId))];
    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      include: { _count: { select: { students: true } } }
    });
    const courseTotals = Object.fromEntries(courses.map(c => [c.id, c._count.students]));

    const result = assignments.map(a => ({
      id: a.id,
      examId: a.examId,
      courseId: a.courseId,
      courseName: `${a.course.level.replace('B', '° Básico').replace('M', '° Medio')} ${a.course.letter}`,
      title: a.exam.title,
      subject: a.exam.subject,
      opensAt: a.opensAt,
      closesAt: a.closesAt,
      released: a.released,
      releasedAt: a.releasedAt,
      dynamicPassword: a.dynamicPassword,
      dynamicPasswordActive: a.dynamicPasswordActive,
      submissionsCount: a._count.submissions,
      totalStudents: courseTotals[a.courseId] || 0
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Contraseña Dinámica de Ensayo (PIN Temporal de Clase)
// ==========================================

router.get('/assignments/:id/dynamic-password', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignment = await prisma.examAssignment.findUnique({
      where: { id },
      select: { id: true, dynamicPassword: true, dynamicPasswordActive: true, courseId: true }
    });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });
    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }
    res.json({
      dynamicPassword: assignment.dynamicPassword,
      dynamicPasswordActive: assignment.dynamicPasswordActive
    });
  } catch (error) {
    next(error);
  }
});

router.post('/assignments/:id/dynamic-password', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignment = await prisma.examAssignment.findUnique({
      where: { id }
    });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });
    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }
    const { dynamicPassword, dynamicPasswordActive } = req.body;
    const updated = await prisma.examAssignment.update({
      where: { id },
      data: {
        dynamicPassword: dynamicPassword ? dynamicPassword.trim().toUpperCase() : null,
        dynamicPasswordActive: Boolean(dynamicPasswordActive)
      }
    });
    res.json({
      dynamicPassword: updated.dynamicPassword,
      dynamicPasswordActive: updated.dynamicPasswordActive
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Liberar Resultados
// ==========================================

router.post('/assignments/:id/release', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignment = await prisma.examAssignment.findUnique({ where: { id } });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const updated = await prisma.examAssignment.update({
      where: { id },
      data: {
        released: true,
        releasedAt: new Date(),
        releasedBy: req.user.name
      }
    });
    res.json({ message: 'Resultados liberados', assignment: updated });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Reportes Específicos de Asignación
// ==========================================

async function getAssignmentIfAllowed(id, user) {
  const assignment = await prisma.examAssignment.findUnique({
    where: { id },
    include: { exam: true, course: true }
  });
  if (!assignment) throw new Error('NOT_FOUND');
  
  if (user.role === 'ADMIN' || user.role === 'DIRECTOR') return assignment;
  if (assignment.assignedTeacherRut === user.rut) return assignment;

  const allowedCourses = await getAllowedCourseIds(user);
  if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
    throw new Error('FORBIDDEN');
  }
  return assignment;
}

function handleAssignmentError(error, res, next) {
  if (error.message === 'NOT_FOUND') return res.status(404).json({ error: 'No encontrado' });
  if (error.message === 'FORBIDDEN') return res.status(403).json({ error: 'No autorizado' });
  next(error);
}

// 1. Live Monitoring
router.get('/assignments/:id/live', async (req, res, next) => {
  try {
    const assignment = await getAssignmentIfAllowed(parseInt(req.params.id, 10), req.user);
    
    // Todos los estudiantes del curso
    const students = await prisma.user.findMany({
      where: { courseId: assignment.courseId, role: 'STUDENT' },
      select: { rut: true, name: true },
      orderBy: { name: 'asc' }
    });

    const questions = await prisma.question.findMany({
      where: { examId: assignment.examId },
      orderBy: { questionNumber: 'asc' }
    });

    const openQuestions = questions.filter(q => isOpenQuestion(q));
    const maxTotalPoints = questions.reduce((sum, q) => sum + getQuestionMaxPoints(q), 0);

    const submissions = await prisma.submission.findMany({
      where: { assignmentId: assignment.id },
      include: { answers: true, _count: { select: { answers: true } } }
    });
    const subMap = Object.fromEntries(submissions.map(s => [s.studentRut, s]));

    const result = students.map(st => {
      const sub = subMap[st.rut];
      let state = 'NOT_STARTED';
      let submittedAt = null;
      let startedAt = null;
      
      const openAnswers = {};
      let openGradedCount = 0;

      if (sub) {
        if (sub.status === 'SUBMITTED') {
          state = 'SUBMITTED';
          submittedAt = sub.submittedAt;
        } else {
          state = 'IN_PROGRESS';
          startedAt = sub.startedAt;
        }

        const ansByQId = Object.fromEntries((sub.answers || []).map(a => [a.questionId, a]));
        for (const oq of openQuestions) {
          const a = ansByQId[oq.id];
          const hasAwarded = a && a.awardedPoints !== null && a.awardedPoints !== undefined;
          if (hasAwarded) openGradedCount++;
          openAnswers[oq.questionNumber] = {
            questionId: oq.id,
            questionNumber: oq.questionNumber,
            questionType: oq.questionType,
            maxPoints: getQuestionMaxPoints(oq),
            selectedAnswer: a?.selectedAnswer || '',
            awardedPoints: hasAwarded ? a.awardedPoints : null
          };
        }
      } else {
        for (const oq of openQuestions) {
          openAnswers[oq.questionNumber] = {
            questionId: oq.id,
            questionNumber: oq.questionNumber,
            questionType: oq.questionType,
            maxPoints: getQuestionMaxPoints(oq),
            selectedAnswer: '',
            awardedPoints: null
          };
        }
      }
      
      return {
        rut: st.rut,
        name: st.name,
        state,
        startedAt,
        submittedAt,
        answersCount: sub ? sub._count.answers : 0,
        grade: sub?.grade || null,
        percent: sub?.percent ?? null,
        correctCount: sub?.correctCount ?? null,
        maxTotalPoints,
        simceScore: sub?.simceScore || null,
        achievementLevel: sub?.achievementLevel || null,
        openGradedCount,
        openTotalCount: openQuestions.length,
        openAnswers
      };
    });

    res.json({
      assignment: {
        id: assignment.id,
        applicationMode: assignment.applicationMode || 'DIGITAL'
      },
      applicationMode: assignment.applicationMode || 'DIGITAL',
      questionCount: questions.length,
      maxTotalPoints,
      hasOpenQuestions: openQuestions.length > 0,
      openQuestions: openQuestions.map(oq => ({
        id: oq.id,
        questionNumber: oq.questionNumber,
        questionType: oq.questionType,
        maxPoints: getQuestionMaxPoints(oq),
        skill: oq.skill,
        axis: oq.axis,
        learningObjective: oq.learningObjective
      })),
      students: result
    });
  } catch (error) {
    handleAssignmentError(error, res, next);
  }
});

// 2. Summary
router.get('/assignments/:id/summary', async (req, res, next) => {
  try {
    const assignment = await getAssignmentIfAllowed(parseInt(req.params.id, 10), req.user);
    
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: assignment.id, status: 'SUBMITTED' }
    });

    const totalStudents = await prisma.user.count({ where: { courseId: assignment.courseId, role: 'STUDENT' } });
    
    let averageGrade = 0;
    let averagePercent = 0;
    let averageSimceScore = null;
    const levelCounts = { INSUFICIENTE: 0, ELEMENTAL: 0, ADECUADO: 0 };
    const gradeRanges = { '1.0-3.9': 0, '4.0-4.9': 0, '5.0-5.9': 0, '6.0-7.0': 0 };

    if (submissions.length > 0) {
      averageGrade = submissions.reduce((sum, s) => sum + (s.grade || 1.0), 0) / submissions.length;
      averagePercent = submissions.reduce((sum, s) => sum + (s.percent || 0), 0) / submissions.length;
      const simceSubmissions = submissions.filter(s => s.simceScore != null);
      if (simceSubmissions.length > 0) {
        averageSimceScore = Math.round(simceSubmissions.reduce((sum, s) => sum + s.simceScore, 0) / simceSubmissions.length);
      }

      submissions.forEach(s => {
        if (s.achievementLevel && levelCounts[s.achievementLevel] !== undefined) {
          levelCounts[s.achievementLevel]++;
        }
        const g = s.grade || 1.0;
        if (g < 4.0) gradeRanges['1.0-3.9']++;
        else if (g < 5.0) gradeRanges['4.0-4.9']++;
        else if (g < 6.0) gradeRanges['5.0-5.9']++;
        else gradeRanges['6.0-7.0']++;
      });
    }

    res.json({
      totalStudents,
      submittedCount: submissions.length,
      averageGrade,
      averagePercent,
      averageSimceScore,
      levelCounts,
      gradeRanges
    });
  } catch (error) {
    handleAssignmentError(error, res, next);
  }
});

// 3. Skills and Axes
router.get('/assignments/:id/skills', async (req, res, next) => {
  try {
    const assignment = await getAssignmentIfAllowed(parseInt(req.params.id, 10), req.user);
    
    const questions = await prisma.question.findMany({ where: { examId: assignment.examId } });
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: assignment.id, status: 'SUBMITTED' },
      include: { answers: true }
    });

    const skills = {};
    const axes = {};

    questions.forEach(q => {
      const maxPts = getQuestionMaxPoints(q);
      if (q.skill) {
        if (!skills[q.skill]) skills[q.skill] = { correct: 0, total: 0 };
        skills[q.skill].total += submissions.length * maxPts;
      }
      if (q.axis) {
        if (!axes[q.axis]) axes[q.axis] = { correct: 0, total: 0 };
        axes[q.axis].total += submissions.length * maxPts;
      }
    });

    submissions.forEach(sub => {
      sub.answers.forEach(ans => {
        const q = questions.find(qu => qu.id === ans.questionId);
        if (!q) return;
        const maxPts = getQuestionMaxPoints(q);
        let earned = 0;
        if (isOpenQuestion(q)) {
          if (ans.awardedPoints !== null && ans.awardedPoints !== undefined) {
            earned = Math.max(0, Math.min(maxPts, Number(ans.awardedPoints)));
          }
        } else if (ans.isCorrect) {
          earned = maxPts;
        }
        if (earned > 0) {
          if (q.skill && skills[q.skill]) skills[q.skill].correct += earned;
          if (q.axis && axes[q.axis]) axes[q.axis].correct += earned;
        }
      });
    });

    const formatObj = (obj) => Object.entries(obj).map(([name, data]) => ({
      name,
      correct: Math.round(data.correct * 10) / 10,
      total: Math.round(data.total * 10) / 10,
      percent: data.total > 0 ? data.correct / data.total : 0
    })).sort((a, b) => a.percent - b.percent);

    res.json({
      skills: formatObj(skills),
      axes: formatObj(axes)
    });
  } catch (error) {
    handleAssignmentError(error, res, next);
  }
});

// 4. Item Analysis (Pregunta a Pregunta con distractores)
router.get('/assignments/:id/remedial', async (req, res, next) => {
  try {
    const assignment = await getAssignmentIfAllowed(parseInt(req.params.id, 10), req.user);
    
    const questions = await prisma.question.findMany({ where: { examId: assignment.examId } });
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: assignment.id, status: 'SUBMITTED' },
      include: { answers: true }
    });

    const clusters = {}; // Key: "EJE|OA|HABILIDAD"
    
    questions.forEach(q => {
      const axis = q.axis || "Sin Eje";
      const oa = q.learningObjective || "Sin OA";
      const skill = q.skill || "Sin Habilidad";
      const key = `${axis} || ${oa} || ${skill}`;
      const maxPts = getQuestionMaxPoints(q);
      
      if (!clusters[key]) {
        clusters[key] = { axis, oa, skill, correct: 0, total: 0, questionsCount: 0 };
      }
      clusters[key].total += submissions.length * maxPts;
      clusters[key].questionsCount += 1;
    });

    submissions.forEach(sub => {
      sub.answers.forEach(ans => {
        const q = questions.find(qu => qu.id === ans.questionId);
        if (!q) return;
        const maxPts = getQuestionMaxPoints(q);
        const key = `${q.axis || "Sin Eje"} || ${q.learningObjective || "Sin OA"} || ${q.skill || "Sin Habilidad"}`;
        if (isOpenQuestion(q)) {
          if (ans.awardedPoints !== null && ans.awardedPoints !== undefined) {
            clusters[key].correct += Math.max(0, Math.min(maxPts, Number(ans.awardedPoints)));
          }
        } else if (ans.isCorrect) {
          clusters[key].correct += maxPts;
        }
      });
    });

    let results = Object.values(clusters).map(c => ({
      ...c,
      correct: Math.round(c.correct * 10) / 10,
      total: Math.round(c.total * 10) / 10,
      percentage: c.total === 0 ? 0 : Math.round((c.correct / c.total) * 100)
    }));

    // Filtrar los que no tienen OA real
    results = results.filter(r => r.oa !== "Sin OA");
    // Ordenar de peor a mejor
    results.sort((a, b) => a.percentage - b.percentage);

    // Tomar los 3 peores
    const weakest = results.slice(0, 3);
    
    let reportText = "No hay suficientes datos u Objetivos de Aprendizaje configurados en la pauta para emitir un reporte remedial.";
    let quizSuggestion = "";

    if (weakest.length > 0) {
      const oas = weakest.map(w => w.oa).join(", ");
      const axes = [...new Set(weakest.map(w => w.axis))].join(" y ");
      const skills = [...new Set(weakest.map(w => w.skill))].join(", ");

      reportText = `Basado en los resultados recientes, el curso presenta descendencias críticas en los Objetivos de Aprendizaje: ${oas}. Se sugiere la confección prioritaria de una Guía Práctica enfocada en el/los eje(s) de ${axes}, trabajando específicamente el desarrollo de habilidades como ${skills}.`;
      
      quizSuggestion = `Sugerencia para Evaluación Corta: Desarrolla un Quiz (Ticket de Salida) de 10 a 15 preguntas enfocado exclusivamente en evaluar los OA descendidos (${oas}) para verificar la efectividad de la acción remedial.`;
    }

    // Buscar propuestas de remedial existentes para esta asignación
    const proposals = await prisma.remedialProposal.findMany({
      where: { originAssignmentId: assignment.id },
      include: {
        remedialExam: true,
        teacher: { select: { name: true, rut: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Buscar si ya existe una asignación remedial activa formal derivada de esta
    const activeRemedialAssignment = await prisma.examAssignment.findFirst({
      where: { remedialOriginId: assignment.id },
      include: {
        exam: true,
        assignedTeacher: { select: { name: true, rut: true } }
      }
    });

    // Exámenes tipo REMEDIAL o QUIZ compatibles con este nivel y asignatura
    const availableRemedialExams = await prisma.exam.findMany({
      where: {
        level: assignment.course.level,
        subject: assignment.exam.subject,
        examType: { in: ['REMEDIAL', 'QUIZ'] }
      },
      select: {
        id: true,
        title: true,
        examType: true,
        subject: true,
        level: true,
        durationMinutes: true,
        orderNumber: true
      }
    });

    // Alerta del sistema: si ya fue rendida y no tiene remedial aprobada ni pendiente
    const isCompletedOrHasSubmissions = submissions.length > 0;
    const hasPendingOrApprovedRemedial = proposals.some(p => p.status === 'PENDING' || p.status === 'APPROVED') || Boolean(activeRemedialAssignment);
    const alertNoRemedial = isCompletedOrHasSubmissions && !hasPendingOrApprovedRemedial;

    res.json({
      weakestClusters: weakest,
      reportText,
      quizSuggestion,
      proposals,
      activeRemedialAssignment,
      availableRemedialExams,
      alertNoRemedial,
      hasSubmissions: isCompletedOrHasSubmissions
    });

  } catch (error) {
    next(error);
  }
});

// El profesor propone / sugiere fecha para acción remedial ante UTP
router.post('/assignments/:id/propose-remedial', async (req, res, next) => {
  try {
    const assignment = await getAssignmentIfAllowed(parseInt(req.params.id, 10), req.user);
    const { suggestedDate, startTime, endTime, remedialExamId, notes } = req.body;

    if (!suggestedDate) {
      return res.status(400).json({ error: 'Debes indicar una fecha sugerida para la remedial.' });
    }

    const proposal = await prisma.remedialProposal.create({
      data: {
        originAssignmentId: assignment.id,
        courseId: assignment.courseId,
        teacherRut: req.user.rut,
        suggestedDate: new Date(suggestedDate),
        startTime: startTime || '08:30',
        endTime: endTime || '10:00',
        remedialExamId: remedialExamId ? parseInt(remedialExamId, 10) : null,
        notes: notes || null,
        status: 'PENDING'
      },
      include: {
        remedialExam: true,
        teacher: { select: { name: true, rut: true } },
        course: true
      }
    });

    res.json({
      message: 'Propuesta remedial enviada a UTP para revisión y aprobación.',
      proposal
    });
  } catch (error) {
    next(error);
  }
});

// Medición de impacto: Ensayo Origen vs. Evaluación Remedial
router.get('/assignments/:id/remedial-impact', async (req, res, next) => {
  try {
    const originAssignment = await getAssignmentIfAllowed(parseInt(req.params.id, 10), req.user);
    
    // Buscar la asignación remedial asociada
    const remedialAssignment = await prisma.examAssignment.findFirst({
      where: { remedialOriginId: originAssignment.id },
      include: {
        exam: { include: { questions: true } },
        submissions: { include: { answers: true } }
      }
    });

    if (!remedialAssignment) {
      return res.json({ hasRemedial: false, message: 'No existe una evaluación remedial asociada a esta prueba.' });
    }

    const originQuestions = await prisma.question.findMany({ where: { examId: originAssignment.examId } });
    const originSubmissions = await prisma.submission.findMany({
      where: { assignmentId: originAssignment.id, status: 'SUBMITTED' },
      include: { answers: true }
    });

    // Comparar OA por OA
    const oaStats = {};

    originQuestions.forEach(q => {
      const oa = q.learningObjective || q.axis || 'General';
      if (!oaStats[oa]) oaStats[oa] = { oa, originCorrect: 0, originTotal: 0, remedialCorrect: 0, remedialTotal: 0 };
    });

    originSubmissions.forEach(sub => {
      sub.answers.forEach(ans => {
        const q = originQuestions.find(qu => qu.id === ans.questionId);
        if (q) {
          const oa = q.learningObjective || q.axis || 'General';
          if (!oaStats[oa]) oaStats[oa] = { oa, originCorrect: 0, originTotal: 0, remedialCorrect: 0, remedialTotal: 0 };
          oaStats[oa].originTotal += 1;
          if (ans.isCorrect) oaStats[oa].originCorrect += 1;
        }
      });
    });

    const remedialQuestions = remedialAssignment.exam.questions;
    remedialAssignment.submissions.forEach(sub => {
      sub.answers.forEach(ans => {
        const q = remedialQuestions.find(qu => qu.id === ans.questionId);
        if (q) {
          const oa = q.learningObjective || q.axis || 'General';
          if (!oaStats[oa]) oaStats[oa] = { oa, originCorrect: 0, originTotal: 0, remedialCorrect: 0, remedialTotal: 0 };
          oaStats[oa].remedialTotal += 1;
          if (ans.isCorrect) oaStats[oa].remedialCorrect += 1;
        }
      });
    });

    const comparison = Object.values(oaStats).map(st => {
      const originPct = st.originTotal > 0 ? Math.round((st.originCorrect / st.originTotal) * 100) : 0;
      const remedialPct = st.remedialTotal > 0 ? Math.round((st.remedialCorrect / st.remedialTotal) * 100) : null;
      const delta = remedialPct !== null ? (remedialPct - originPct) : null;
      return {
        oa: st.oa,
        originPct,
        remedialPct,
        delta
      };
    });

    res.json({
      hasRemedial: true,
      originExamTitle: originAssignment.exam.title,
      remedialExamTitle: remedialAssignment.exam.title,
      remedialOpensAt: remedialAssignment.opensAt,
      comparison
    });
  } catch (error) {
    next(error);
  }
});

router.get('/assignments/:id/items', async (req, res, next) => {
  try {
    const assignment = await getAssignmentIfAllowed(parseInt(req.params.id, 10), req.user);
    
    const questions = await prisma.question.findMany({ 
      where: { examId: assignment.examId },
      orderBy: { questionNumber: 'asc' }
    });
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: assignment.id, status: 'SUBMITTED' },
      include: { answers: true }
    });

    const analysis = questions.map(q => {
      const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL' || q.correctAnswer === 'DESARROLLO' || q.correctAnswer === 'ORAL';
      const maxPts = q.maxPoints != null && q.maxPoints > 0 ? Number(q.maxPoints) : 1;
      const stats = {
        id: q.id,
        questionNumber: q.questionNumber,
        questionType: q.questionType || 'MULTIPLE_CHOICE',
        maxPoints: maxPts,
        skill: q.skill,
        axis: q.axis,
        correctAnswer: q.correctAnswer,
        totalAnswers: submissions.length,
        correctCount: 0,
        omittedCount: submissions.length,
        gradedCount: 0,
        avgPoints: null,
        options: { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0 }
      };

      if (isOpen) {
        let sumPts = 0;
        submissions.forEach(sub => {
          const ans = sub.answers.find(a => a.questionId === q.id);
          if (ans && (ans.awardedPoints != null || (ans.selectedAnswer && String(ans.selectedAnswer).trim()))) {
            stats.omittedCount--;
          }
          if (ans && ans.awardedPoints != null && !isNaN(Number(ans.awardedPoints))) {
            const pts = Math.max(0, Math.min(maxPts, Number(ans.awardedPoints)));
            stats.gradedCount++;
            sumPts += pts;
            if (pts >= maxPts * 0.6) stats.correctCount++;
          }
        });
        stats.avgPoints = stats.gradedCount > 0 ? Math.round((sumPts / stats.gradedCount) * 100) / 100 : null;
        stats.percent = stats.totalAnswers > 0 ? sumPts / (stats.totalAnswers * maxPts) : 0;
      } else {
        submissions.forEach(sub => {
          const ans = sub.answers.find(a => a.questionId === q.id);
          if (ans && ans.selectedAnswer) {
            stats.omittedCount--;
            if (stats.options[ans.selectedAnswer] !== undefined) {
              stats.options[ans.selectedAnswer]++;
            }
            if (ans.isCorrect) stats.correctCount++;
          }
        });
        stats.percent = stats.totalAnswers > 0 ? stats.correctCount / stats.totalAnswers : 0;
      }

      return stats;
    });

    res.json(analysis);
  } catch (error) {
    handleAssignmentError(error, res, next);
  }
});

// 5. Excel Export (Multi-hoja 360°)
router.get('/assignments/:id/export.xlsx', async (req, res, next) => {
  try {
    const assignment = await getAssignmentIfAllowed(parseInt(req.params.id, 10), req.user);
    
    const students = await prisma.user.findMany({
      where: { courseId: assignment.courseId, role: 'STUDENT' },
      orderBy: { name: 'asc' }
    });
    
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: assignment.id, status: 'SUBMITTED' },
      include: { answers: { include: { question: true } } }
    });
    const subMap = Object.fromEntries(submissions.map(s => [s.studentRut, s]));

    const questions = await prisma.question.findMany({ 
      where: { examId: assignment.examId },
      orderBy: { questionNumber: 'asc' }
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Concepción de Chillán';

    // HOJA 1: Resultados Alumnos
    const sheet1 = workbook.addWorksheet('Resultados Alumnos');
    const columns1 = [
      { header: 'RUT', key: 'rut', width: 14 },
      { header: 'Nombre Estudiante', key: 'name', width: 32 },
      { header: 'Nota', key: 'grade', width: 10 },
      { header: 'Puntaje SIMCE', key: 'simceScore', width: 16 },
      { header: 'Nivel de Logro', key: 'level', width: 16 },
      { header: '% Logro', key: 'percent', width: 12 }
    ];
    questions.forEach(q => {
      const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL';
      const label = isOpen
        ? `${q.questionType === 'ORAL' ? 'Oral' : 'Des.'} ${q.maxPoints || 1}pts`
        : q.correctAnswer;
      columns1.push({ header: `P${q.questionNumber} (${label})`, key: `q_${q.id}`, width: isOpen ? 16 : 10 });
    });
    sheet1.columns = columns1;

    students.forEach(st => {
      const sub = subMap[st.rut];
      const pVal = sub?.percent != null
        ? (sub.percent > 1 ? Math.round(sub.percent) : Math.round(sub.percent * 100)) + '%'
        : '';
      const row = {
        rut: st.rut,
        name: st.name,
        grade: sub?.grade != null ? sub.grade.toFixed(1) : '',
        simceScore: sub?.simceScore != null ? sub.simceScore : '',
        level: sub?.achievementLevel || '',
        percent: pVal
      };
      if (sub) {
        sub.answers.forEach(a => {
          const q = a.question;
          if (q && (q.questionType === 'WRITTEN' || q.questionType === 'ORAL')) {
            row[`q_${a.questionId}`] = a.awardedPoints != null
              ? `${a.awardedPoints}/${q.maxPoints || 1} pts`
              : (a.selectedAnswer ? '[Sin calificar]' : 'Omitida');
          } else {
            row[`q_${a.questionId}`] = a.selectedAnswer || 'Omitida';
          }
        });
      }
      sheet1.addRow(row);
    });

    // HOJA 2: Resumen Ejecutivo
    const sheet2 = workbook.addWorksheet('Resumen Ejecutivo');
    sheet2.columns = [
      { header: 'Indicador / Métrica', key: 'metric', width: 35 },
      { header: 'Valor', key: 'value', width: 25 }
    ];

    const totalStudents = students.length;
    const submittedCount = submissions.length;
    const participationPct = totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;
    const avgGrade = submittedCount > 0 ? (submissions.reduce((sum, s) => sum + (s.grade || 1.0), 0) / submittedCount).toFixed(1) : '0.0';
    const simceSubs = submissions.filter(s => s.simceScore != null);
    const avgSimce = simceSubs.length > 0 ? Math.round(simceSubs.reduce((sum, s) => sum + s.simceScore, 0) / simceSubs.length) : 'N/A';
    const avgPercent = submittedCount > 0 ? Math.round(submissions.reduce((sum, s) => sum + (s.percent || 0), 0) / submittedCount) : 0;

    const countAdecuado = submissions.filter(s => s.achievementLevel === 'ADECUADO').length;
    const countElemental = submissions.filter(s => s.achievementLevel === 'ELEMENTAL').length;
    const countInsuficiente = submissions.filter(s => s.achievementLevel === 'INSUFICIENTE').length;

    sheet2.addRows([
      { metric: 'Título del Ensayo', value: assignment.exam.title },
      { metric: 'Asignatura', value: assignment.exam.subject },
      { metric: 'Curso', value: `${assignment.course.level.replace('B', '° Básico').replace('M', '° Medio')} ${assignment.course.letter}` },
      { metric: 'Total Matrícula del Curso', value: totalStudents },
      { metric: 'Estudiantes Evaluados (Entregas)', value: submittedCount },
      { metric: 'Estudiantes Ausentes / Pendientes', value: totalStudents - submittedCount },
      { metric: 'Tasa de Participación', value: `${participationPct}%` },
      { metric: 'Nota Promedio (1.0 - 7.0)', value: avgGrade },
      { metric: 'Puntaje SIMCE Promedio (200 - 350 pts)', value: avgSimce },
      { metric: '% Logro Promedio', value: `${avgPercent}%` },
      { metric: 'Nivel Adecuado (≥ 284 pts)', value: `${countAdecuado} estudiantes (${submittedCount > 0 ? Math.round((countAdecuado / submittedCount) * 100) : 0}%)` },
      { metric: 'Nivel Elemental (241 - 283 pts)', value: `${countElemental} estudiantes (${submittedCount > 0 ? Math.round((countElemental / submittedCount) * 100) : 0}%)` },
      { metric: 'Nivel Insuficiente (< 241 pts)', value: `${countInsuficiente} estudiantes (${submittedCount > 0 ? Math.round((countInsuficiente / submittedCount) * 100) : 0}%)` }
    ]);

    // HOJA 3: Habilidades y Ejes
    const sheet3 = workbook.addWorksheet('Habilidades y Ejes');
    sheet3.columns = [
      { header: 'Dimensión Curricular', key: 'dim', width: 20 },
      { header: 'Nombre de Habilidad / Eje', key: 'name', width: 35 },
      { header: 'Preguntas Asociadas', key: 'qCount', width: 22 },
      { header: 'Puntos Obtenidos', key: 'correct', width: 22 },
      { header: 'Puntos Posibles', key: 'total', width: 22 },
      { header: '% Logro del Curso', key: 'percent', width: 20 }
    ];

    const skillMap = {};
    const axisMap = {};
    questions.forEach(q => {
      const qMax = (q.questionType === 'WRITTEN' || q.questionType === 'ORAL') ? (q.maxPoints || 1) : 1;
      if (q.skill) {
        if (!skillMap[q.skill]) skillMap[q.skill] = { questions: 0, correct: 0, total: 0 };
        skillMap[q.skill].questions += 1;
        skillMap[q.skill].total += submissions.length * qMax;
      }
      if (q.axis) {
        if (!axisMap[q.axis]) axisMap[q.axis] = { questions: 0, correct: 0, total: 0 };
        axisMap[q.axis].questions += 1;
        axisMap[q.axis].total += submissions.length * qMax;
      }
    });

    submissions.forEach(sub => {
      sub.answers.forEach(a => {
        const q = a.question;
        if (!q) return;
        const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL';
        const qMax = isOpen ? (q.maxPoints || 1) : 1;
        const earned = isOpen
          ? (a.awardedPoints != null ? Math.max(0, Math.min(qMax, Number(a.awardedPoints))) : 0)
          : (a.isCorrect ? 1 : 0);
        if (q.skill && skillMap[q.skill]) skillMap[q.skill].correct += earned;
        if (q.axis && axisMap[q.axis]) axisMap[q.axis].correct += earned;
      });
    });

    Object.entries(skillMap).forEach(([name, st]) => {
      const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
      sheet3.addRow({ dim: 'Habilidad', name, qCount: st.questions, correct: Math.round(st.correct * 10) / 10, total: st.total, percent: `${pct}%` });
    });

    Object.entries(axisMap).forEach(([name, st]) => {
      const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
      sheet3.addRow({ dim: 'Eje Temático', name, qCount: st.questions, correct: Math.round(st.correct * 10) / 10, total: st.total, percent: `${pct}%` });
    });

    // HOJA 4: Análisis de Preguntas
    const sheet4 = workbook.addWorksheet('Análisis de Preguntas');
    sheet4.columns = [
      { header: 'N°', key: 'num', width: 8 },
      { header: 'Tipo', key: 'qType', width: 18 },
      { header: 'Habilidad', key: 'skill', width: 25 },
      { header: 'Eje Temático', key: 'axis', width: 25 },
      { header: 'Clave / Pts Máx', key: 'correctAnswer', width: 16 },
      { header: 'Logro / Correctas', key: 'correctCount', width: 16 },
      { header: 'Total Evaluados', key: 'total', width: 14 },
      { header: '% Logro', key: 'percent', width: 12 },
      { header: 'A', key: 'optA', width: 8 },
      { header: 'B', key: 'optB', width: 8 },
      { header: 'C', key: 'optC', width: 8 },
      { header: 'D', key: 'optD', width: 8 },
      { header: 'Omitidas', key: 'omitted', width: 10 }
    ];

    questions.forEach(q => {
      const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL';
      const maxPts = isOpen ? (q.maxPoints || 1) : 1;
      let correctCount = 0;
      let sumPts = 0;
      const opts = { A: 0, B: 0, C: 0, D: 0 };
      let omitted = 0;

      submissions.forEach(sub => {
        const ans = sub.answers.find(a => a.questionId === q.id);
        if (isOpen) {
          if (ans && ans.awardedPoints != null) {
            const pts = Math.max(0, Math.min(maxPts, Number(ans.awardedPoints)));
            sumPts += pts;
            if (pts >= maxPts * 0.6) correctCount++;
          } else {
            omitted++;
          }
        } else {
          if (ans && ans.selectedAnswer) {
            if (opts[ans.selectedAnswer] !== undefined) opts[ans.selectedAnswer]++;
            if (ans.isCorrect) correctCount++;
          } else {
            omitted++;
          }
        }
      });

      const totalAns = submissions.length;
      const pct = totalAns > 0
        ? (isOpen ? Math.round((sumPts / (totalAns * maxPts)) * 100) : Math.round((correctCount / totalAns) * 100))
        : 0;

      sheet4.addRow({
        num: q.questionNumber,
        qType: q.questionType === 'ORAL' ? 'Desarrollo Oral' : q.questionType === 'WRITTEN' ? 'Desarrollo Escrito' : 'Selección Múltiple',
        skill: q.skill || 'Sin habilidad',
        axis: q.axis || 'Sin eje',
        correctAnswer: isOpen ? `${maxPts} pts máx.` : q.correctAnswer,
        correctCount: isOpen ? `Prom: ${(totalAns > 0 ? sumPts / totalAns : 0).toFixed(1)} pts` : correctCount,
        total: totalAns,
        percent: `${pct}%`,
        optA: isOpen ? '-' : opts.A,
        optB: isOpen ? '-' : opts.B,
        optC: isOpen ? '-' : opts.C,
        optD: isOpen ? '-' : opts.D,
        omitted
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Resultados_${assignment.exam.title.replace(/\s+/g, '_')}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    handleAssignmentError(error, res, next);
  }
});

// Exportar Resumen de Ensayos del Profesor a Excel
router.get('/assignments-export.xlsx', async (req, res, next) => {
  try {
    const allowedCourses = await getAllowedCourseIds(req.user);
    const where = {};
    if (allowedCourses) {
      where.OR = [
        { assignedTeacherRut: req.user.rut },
        { courseId: { in: allowedCourses } }
      ];
    }

    const assignments = await prisma.examAssignment.findMany({
      where,
      include: {
        exam: true,
        course: { include: { students: true } },
        submissions: { where: { status: 'SUBMITTED' } }
      },
      orderBy: { opensAt: 'desc' }
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Concepción de Chillán';
    const sheet = workbook.addWorksheet('Mis Cursos y Ensayos');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Curso', key: 'course', width: 14 },
      { header: 'Asignatura', key: 'subject', width: 20 },
      { header: 'Título del Ensayo', key: 'title', width: 35 },
      { header: 'Apertura', key: 'opensAt', width: 14 },
      { header: 'Cierre', key: 'closesAt', width: 14 },
      { header: 'Entregas', key: 'submitted', width: 12 },
      { header: 'Matrícula', key: 'total', width: 12 },
      { header: 'Participación', key: 'participation', width: 15 },
      { header: 'Nota Promedio', key: 'avgGrade', width: 15 },
      { header: 'SIMCE Promedio', key: 'avgSimce', width: 16 }
    ];

    assignments.forEach(a => {
      const subs = a.submissions;
      const total = a.course?.students?.length || 0;
      const avgG = subs.length > 0 ? (subs.reduce((acc, s) => acc + (s.grade || 1.0), 0) / subs.length).toFixed(1) : 'N/A';
      const simceSubs = subs.filter(s => s.simceScore != null);
      const avgS = simceSubs.length > 0 ? Math.round(simceSubs.reduce((acc, s) => acc + s.simceScore, 0) / simceSubs.length) : 'N/A';
      const part = total > 0 ? Math.round((subs.length / total) * 100) + '%' : '0%';

      sheet.addRow({
        id: a.id,
        course: a.course ? `${a.course.level.replace('B', '° Básico').replace('M', '° Medio')} ${a.course.letter}` : 'Sin curso',
        subject: a.exam.subject,
        title: a.exam.title,
        opensAt: new Date(a.opensAt).toLocaleDateString('es-CL'),
        closesAt: new Date(a.closesAt).toLocaleDateString('es-CL'),
        submitted: subs.length,
        total,
        participation: part,
        avgGrade: avgG,
        avgSimce: avgS
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Resumen_Docente_Ensayos.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Ficha de Estudiante (Evolución)
// ==========================================

router.get('/students/:rut', async (req, res, next) => {
  try {
    let targetRut = normalizeRut(req.params.rut);
    const student = await prisma.user.findUnique({
      where: { rut: targetRut },
      include: { course: true }
    });
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(student.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este estudiante' });
    }

    const submissions = await prisma.submission.findMany({
      where: { studentRut: targetRut, status: 'SUBMITTED' },
      include: { assignment: { include: { exam: true } } },
      orderBy: { submittedAt: 'asc' }
    });

    const result = {
      rut: student.rut,
      name: student.name,
      courseName: student.course ? `${student.course.level.replace('B', '° Básico').replace('M', '° Medio')} ${student.course.letter}` : 'Sin curso',
      history: submissions.map(s => ({
        id: s.id,
        assignmentId: s.assignmentId,
        date: s.submittedAt,
        title: s.assignment.exam.title,
        subject: s.assignment.exam.subject,
        grade: s.grade,
        percent: s.percent,
        simceScore: s.simceScore,
        theta: s.theta,
        level: s.achievementLevel
      }))
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Exportar Ficha del Estudiante a Excel
router.get('/students/:rut/export.xlsx', async (req, res, next) => {
  try {
    let targetRut = normalizeRut(req.params.rut);
    const student = await prisma.user.findUnique({
      where: { rut: targetRut },
      include: { course: true }
    });
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(student.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este estudiante' });
    }

    const submissions = await prisma.submission.findMany({
      where: { studentRut: targetRut, status: 'SUBMITTED' },
      include: { assignment: { include: { exam: true } } },
      orderBy: { submittedAt: 'asc' }
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Concepción de Chillán';
    const sheet = workbook.addWorksheet('Historial Evaluativo');

    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Ensayo / Evaluación', key: 'title', width: 35 },
      { header: 'Asignatura', key: 'subject', width: 22 },
      { header: 'Nota Escolar', key: 'grade', width: 14 },
      { header: 'Puntaje SIMCE', key: 'simceScore', width: 16 },
      { header: 'Nivel de Logro', key: 'level', width: 16 },
      { header: '% Logro', key: 'percent', width: 12 },
      { header: 'Habilidad Latente (Theta)', key: 'theta', width: 24 }
    ];

    submissions.forEach(s => {
      const pVal = s.percent != null ? (s.percent > 1 ? Math.round(s.percent) : Math.round(s.percent * 100)) + '%' : '';
      sheet.addRow({
        date: s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('es-CL') : '',
        title: s.assignment.exam.title,
        subject: s.assignment.exam.subject,
        grade: s.grade != null ? s.grade.toFixed(1) : '',
        simceScore: s.simceScore != null ? s.simceScore : '',
        level: s.achievementLevel || '',
        percent: pVal,
        theta: s.theta != null ? s.theta.toFixed(3) : ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Ficha_SIMCE_${student.rut}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Evolución Longitudinal del Curso
// ==========================================
router.get('/assignments/:id/evolution', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const currentAssignment = await prisma.examAssignment.findUnique({
      where: { id },
      include: { course: true, exam: true }
    });
    if (!currentAssignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(currentAssignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const { examType, orderNumbers } = req.query;
    const orderNums = orderNumbers ? String(orderNumbers).split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)) : undefined;

    const examWhere = { subject: currentAssignment.exam.subject };
    if (examType && examType !== 'TODOS') {
      examWhere.examType = examType;
    }
    if (orderNums && orderNums.length > 0) {
      examWhere.orderNumber = { in: orderNums };
    }

    // Buscar asignaciones del mismo curso con filtros opcionales
    const courseAssignments = await prisma.examAssignment.findMany({
      where: {
        courseId: currentAssignment.courseId,
        exam: examWhere
      },
      include: {
        exam: { include: { questions: true } },
        submissions: {
          where: { status: 'SUBMITTED' },
          include: { answers: true }
        }
      },
      orderBy: { opensAt: 'asc' }
    });

    const totalStudentsInCourse = await prisma.user.count({
      where: { courseId: currentAssignment.courseId, role: 'STUDENT' }
    });

    const timeline = courseAssignments.map(a => {
      const subs = a.submissions;
      const count = subs.length;
      let sumSimce = 0;
      let sumGrade = 0;
      let sumPercent = 0;
      const levels = { INSUFICIENTE: 0, ELEMENTAL: 0, ADECUADO: 0 };

      // Habilidades y OAs agregados
      const skillTotals = {};
      const oaTotals = {};

      subs.forEach(s => {
        if (s.simceScore) sumSimce += s.simceScore;
        if (s.grade) sumGrade += s.grade;
        if (s.percent) sumPercent += s.percent;
        if (s.achievementLevel && levels[s.achievementLevel] !== undefined) {
          levels[s.achievementLevel]++;
        }

        // Respuestas por pregunta
        s.answers.forEach(ans => {
          const q = a.exam.questions.find(qu => qu.id === ans.questionId);
          if (q) {
            if (q.skill) {
              if (!skillTotals[q.skill]) skillTotals[q.skill] = { correct: 0, total: 0 };
              skillTotals[q.skill].total++;
              if (ans.isCorrect) skillTotals[q.skill].correct++;
            }
            if (q.learningObjective) {
              if (!oaTotals[q.learningObjective]) oaTotals[q.learningObjective] = { correct: 0, total: 0 };
              oaTotals[q.learningObjective].total++;
              if (ans.isCorrect) oaTotals[q.learningObjective].correct++;
            }
          }
        });
      });

      const avgSimce = count ? Math.round(sumSimce / count) : null;
      const avgGrade = count ? Math.round((sumGrade / count) * 10) / 10 : null;
      const avgPercent = count ? Math.round((sumPercent / count) * 10) / 10 : null;

      const bySkill = Object.entries(skillTotals).map(([name, st]) => ({
        name,
        percent: st.total ? Math.round((st.correct / st.total) * 100) : 0
      }));

      const byOA = Object.entries(oaTotals).map(([name, ot]) => ({
        name,
        percent: ot.total ? Math.round((ot.correct / ot.total) * 100) : 0
      }));

      return {
        assignmentId: a.id,
        examId: a.exam.id,
        examTitle: a.exam.title,
        orderNumber: a.exam.orderNumber,
        examType: a.exam.examType,
        subject: a.exam.subject,
        date: a.opensAt,
        submissionsCount: count,
        totalStudents: totalStudentsInCourse,
        avgSimceScore: avgSimce,
        avgGrade,
        avgPercent,
        levels,
        bySkill,
        byOA,
      };
    });

    const allCourseAssignments = await prisma.examAssignment.findMany({
      where: { courseId: currentAssignment.courseId },
      include: { exam: { select: { examType: true, orderNumber: true, subject: true } } }
    });
    const availableExamTypes = Array.from(new Set(allCourseAssignments.map(ca => ca.exam.examType))).filter(Boolean);
    const availableOrderNumbers = Array.from(new Set(allCourseAssignments.map(ca => ca.exam.orderNumber))).filter(Boolean).sort((a, b) => a - b);

    res.json({
      currentAssignmentId: currentAssignment.id,
      course: {
        id: currentAssignment.course.id,
        name: `${currentAssignment.course.level.replace('B', '° Básico').replace('M', '° Medio')} ${currentAssignment.course.letter}`,
        subject: currentAssignment.exam.subject,
      },
      timeline,
      filters: {
        availableExamTypes,
        availableOrderNumbers
      }
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Datos para Impresión de Hojas de Respuestas Personalizadas
// ==========================================
router.get('/assignments/:id/printable-sheet-data', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignment = await prisma.examAssignment.findUnique({
      where: { id },
      include: {
        exam: {
          include: {
            questions: {
              orderBy: { questionNumber: 'asc' },
              select: { id: true, questionNumber: true, correctAnswer: true, questionType: true, maxPoints: true }
            }
          }
        },
        course: {
          include: {
            students: {
              where: { role: 'STUDENT', isActive: true },
              orderBy: { name: 'asc' },
              select: { rut: true, name: true }
            }
          }
        }
      }
    });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cLvl = (assignment.course.level || '').replace('B', '° Básico').replace('M', '° Medio');
    const courseFullName = `${cLvl} ${assignment.course.letter} (${assignment.course.year})`;

    return res.json({
      assignment: {
        id: assignment.id,
        opensAt: assignment.opensAt,
        closesAt: assignment.closesAt,
        dynamicPassword: assignment.dynamicPassword,
        applicationMode: assignment.applicationMode || 'DIGITAL'
      },
      exam: {
        id: assignment.exam.id,
        title: assignment.exam.title,
        subject: assignment.exam.subject,
        level: assignment.exam.level,
        optionsCount: assignment.exam.optionsCount || 4,
        questionCount: assignment.exam.questions.length,
        questions: assignment.exam.questions
      },
      course: {
        id: assignment.course.id,
        level: assignment.course.level,
        letter: assignment.course.letter,
        year: assignment.course.year,
        fullName: courseFullName
      },
      students: assignment.course?.students || []
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Plantilla de Respuestas para Escáner / Papel (.xlsx) Prellenada
// ==========================================
router.get('/assignments/:id/template-answers.xlsx', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignment = await prisma.examAssignment.findUnique({
      where: { id },
      include: {
        exam: {
          include: {
            questions: { orderBy: { questionNumber: 'asc' } }
          }
        },
        course: {
          include: {
            students: {
              where: { role: 'STUDENT', isActive: true },
              orderBy: { name: 'asc' }
            }
          }
        }
      }
    });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Cerro Grande';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(`Respuestas_${assignment.id}`);

    const columns = [
      { header: 'RUT', key: 'rut', width: 16 },
      { header: 'Nombre', key: 'name', width: 34 }
    ];

    assignment.exam.questions.forEach(q => {
      const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL';
      columns.push({
        header: isOpen ? `P${q.questionNumber} (Pts 0-${q.maxPoints || 1})` : `P${q.questionNumber}`,
        key: `p${q.questionNumber}`,
        width: isOpen ? 16 : 8
      });
    });

    sheet.columns = columns;

    // Estilo encabezado
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' } // Azul corporativo CCG
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Agregar filas con los estudiantes matriculados en el curso
    const students = assignment.course?.students || [];
    students.forEach(st => {
      sheet.addRow({
        rut: st.rut,
        name: st.name
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Formato_Respuestas_Ensayo_${assignment.id}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Carga Masiva OMR / Escáner y Digitación Rápida (JSON)
// ==========================================
router.post('/assignments/:id/omr-bulk-submit', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { submissions } = req.body;
    if (!Array.isArray(submissions) || submissions.length === 0) {
      return res.status(400).json({ error: 'No se recibieron entregas para procesar' });
    }

    const assignment = await prisma.examAssignment.findUnique({
      where: { id },
      include: {
        exam: {
          include: {
            questions: { orderBy: { questionNumber: 'asc' } }
          }
        },
        course: true
      }
    });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const questions = assignment.exam.questions;
    const questionsByNum = {};
    const questionsById = {};
    questions.forEach(q => {
      questionsByNum[q.questionNumber] = q;
      questionsById[q.id] = q;
    });

    const results = { imported: 0, updated: 0, errors: [] };

    for (const subItem of submissions) {
      const rawRut = subItem.studentRut;
      if (!rawRut) {
        results.errors.push({ error: 'RUT de estudiante no especificado' });
        continue;
      }
      const rut = normalizeRut(rawRut);
      if (rut.length < 3) {
        results.errors.push({ rut: rawRut, error: 'RUT inválido' });
        continue;
      }

      try {
        let student = await prisma.user.findUnique({ where: { rut } });
        if (!student) {
          const studentName = subItem.studentName || `Estudiante ${rut}`;
          const password = rut.split('-')[0].slice(0, 6);
          const hash = await bcrypt.hash(password, 10);
          student = await prisma.user.create({
            data: {
              rut,
              name: studentName,
              role: 'STUDENT',
              courseId: assignment.courseId,
              passwordHash: hash,
              mustChangePassword: true
            }
          });
        }

        const incomingAnswers = subItem.answers || {};
        const incomingOpenScores = subItem.openScores || {};
        const answersMap = {};
        const openScoresMap = {};

        for (const [key, rawVal] of Object.entries(incomingAnswers)) {
          const q = questionsByNum[key] || questionsById[key];
          if (!q) continue;
          const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL';
          if (isOpen) {
            const num = parseFloat(String(rawVal ?? '').replace(',', '.'));
            if (!isNaN(num)) {
              openScoresMap[q.id] = Math.max(0, Math.min(q.maxPoints || 1, num));
            }
            continue;
          }
          const val = String(rawVal || '').trim().toUpperCase();
          if (!val || val === '-' || val === 'BLANCO' || val === 'DOBLE_MARCA') continue;
          answersMap[q.id] = val;
        }

        for (const [key, rawScore] of Object.entries(incomingOpenScores)) {
          const q = questionsByNum[key] || questionsById[key];
          if (!q) continue;
          if (rawScore === null || rawScore === '') continue;
          const num = parseFloat(String(rawScore).replace(',', '.'));
          if (!isNaN(num)) {
            openScoresMap[q.id] = Math.max(0, Math.min(q.maxPoints || 1, num));
          }
        }

        let submission = await prisma.submission.findUnique({
          where: { studentRut_assignmentId: { studentRut: rut, assignmentId: assignment.id } },
          include: { answers: true }
        });

        const isNew = !submission;
        if (!submission) {
          submission = await prisma.submission.create({
            data: {
              studentRut: rut,
              assignmentId: assignment.id,
              startedAt: new Date(),
              status: 'IN_PROGRESS'
            },
            include: { answers: true }
          });
        }

        const existingAnswersByQId = Object.fromEntries((submission.answers || []).map(a => [a.questionId, a]));
        const finalAwardedMap = {};

        for (const q of questions) {
          const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL';
          if (isOpen) {
            const existing = existingAnswersByQId[q.id];
            const incomingPts = openScoresMap[q.id];
            const finalPts = incomingPts !== undefined ? incomingPts : (existing?.awardedPoints ?? null);
            if (finalPts !== null) {
              finalAwardedMap[q.id] = finalPts;
              const isCorrect = finalPts >= (q.maxPoints || 1);
              await prisma.submissionAnswer.upsert({
                where: {
                  submissionId_questionId: {
                    submissionId: submission.id,
                    questionId: q.id
                  }
                },
                update: { awardedPoints: finalPts, isCorrect },
                create: {
                  submissionId: submission.id,
                  questionId: q.id,
                  selectedAnswer: existing?.selectedAnswer || null,
                  awardedPoints: finalPts,
                  isCorrect
                }
              });
            }
            continue;
          }

          const selected = answersMap[q.id] || null;
          if (selected) {
            const isCorrect = selected === q.correctAnswer;
            await prisma.submissionAnswer.upsert({
              where: {
                submissionId_questionId: {
                  submissionId: submission.id,
                  questionId: q.id
                }
              },
              update: { selectedAnswer: selected, isCorrect },
              create: {
                submissionId: submission.id,
                questionId: q.id,
                selectedAnswer: selected,
                isCorrect
              }
            });
          } else {
            await prisma.submissionAnswer.deleteMany({
              where: {
                submissionId: submission.id,
                questionId: q.id
              }
            });
          }
        }

        const computed = computeResults(questions, answersMap, assignment.exam, finalAwardedMap);

        await prisma.submission.update({
          where: { id: submission.id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
            autoSubmitted: false,
            correctCount: computed.correctCount,
            percent: computed.percent,
            grade: computed.grade,
            achievementLevel: computed.achievementLevel,
            simceScore: computed.simceScore,
            theta: computed.theta,
            seTheta: computed.seTheta
          }
        });

        if (isNew) results.imported++;
        else results.updated++;
      } catch (err) {
        results.errors.push({ rut, error: err.message });
      }
    }

    return res.json(results);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Carga Masiva de Respuestas (Escáner / Papel) (.xlsx / .csv)
// ==========================================
router.post('/assignments/:id/import-answers', uploadMemory.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });

  try {
    const id = parseInt(req.params.id, 10);
    const assignment = await prisma.examAssignment.findUnique({
      where: { id },
      include: {
        exam: {
          include: {
            questions: { orderBy: { questionNumber: 'asc' } }
          }
        },
        course: true
      }
    });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const worksheet = await parseSpreadsheet(req.file.buffer, req.file.originalname);
    const results = { imported: 0, errors: [] };
    const questions = assignment.exam.questions;
    const questionsByNum = {};
    questions.forEach(q => { questionsByNum[q.questionNumber] = q; });

    // Map column headers (e.g., P1, P2, P25 (Pts 0-7)... or index based)
    const headerRow = worksheet.getRow(1);
    const colToQNum = {};
    for (let c = 1; c <= headerRow.cellCount; c++) {
      const headerVal = String(headerRow.getCell(c).text || '').trim().toUpperCase();
      const match = headerVal.match(/^P?(\d+)\b/);
      if (match && parseInt(match[1], 10) in questionsByNum) {
        colToQNum[c] = parseInt(match[1], 10);
      }
    }

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      let rawRut = (row.getCell(1).text || '').trim();
      if (!rawRut) continue;

      let rut = normalizeRut(rawRut);
      if (rut.length < 3) continue;

      try {
        let student = await prisma.user.findUnique({ where: { rut } });
        if (!student) {
          let studentName = (row.getCell(2).text || '').trim() || `Estudiante ${rut}`;
          const password = rut.split('-')[0].slice(0, 6);
          const hash = await bcrypt.hash(password, 10);
          student = await prisma.user.create({
            data: {
              rut,
              name: studentName,
              role: 'STUDENT',
              courseId: assignment.courseId,
              passwordHash: hash,
              mustChangePassword: true
            }
          });
        }

        // Map answers and open question scores
        const answersMap = {};
        const openScoresMap = {};
        const readCellForQuestion = (q, cellText) => {
          const val = String(cellText || '').trim();
          if (!val || val === '-') return;
          const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL';
          if (isOpen) {
            const num = parseFloat(val.replace(',', '.'));
            if (!isNaN(num)) {
              openScoresMap[q.id] = Math.max(0, Math.min(q.maxPoints || 1, num));
            }
          } else {
            answersMap[q.id] = val.toUpperCase();
          }
        };

        if (Object.keys(colToQNum).length > 0) {
          for (const [colIdx, qNum] of Object.entries(colToQNum)) {
            const q = questionsByNum[qNum];
            if (q) readCellForQuestion(q, row.getCell(parseInt(colIdx, 10)).text);
          }
        } else {
          // Fallback: columns 3 onwards are questions in order
          questions.forEach((q, idx) => {
            readCellForQuestion(q, row.getCell(3 + idx).text);
          });
        }

        // Upsert Submission
        let submission = await prisma.submission.findUnique({
          where: { studentRut_assignmentId: { studentRut: rut, assignmentId: assignment.id } },
          include: { answers: true }
        });

        if (!submission) {
          submission = await prisma.submission.create({
            data: {
              studentRut: rut,
              assignmentId: assignment.id,
              startedAt: new Date(),
              status: 'IN_PROGRESS'
            },
            include: { answers: true }
          });
        }

        const existingAnswersByQId = Object.fromEntries((submission.answers || []).map(a => [a.questionId, a]));
        const finalAwardedMap = {};

        // Upsert Answers
        for (const q of questions) {
          const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL';
          if (isOpen) {
            const existing = existingAnswersByQId[q.id];
            const incomingPts = openScoresMap[q.id];
            const finalPts = incomingPts !== undefined ? incomingPts : (existing?.awardedPoints ?? null);
            if (finalPts !== null) {
              finalAwardedMap[q.id] = finalPts;
              const isCorrect = finalPts >= (q.maxPoints || 1);
              await prisma.submissionAnswer.upsert({
                where: {
                  submissionId_questionId: {
                    submissionId: submission.id,
                    questionId: q.id
                  }
                },
                update: { awardedPoints: finalPts, isCorrect },
                create: {
                  submissionId: submission.id,
                  questionId: q.id,
                  selectedAnswer: existing?.selectedAnswer || null,
                  awardedPoints: finalPts,
                  isCorrect
                }
              });
            }
            continue;
          }

          const selected = answersMap[q.id] || null;
          if (selected) {
            const isCorrect = selected === q.correctAnswer;
            await prisma.submissionAnswer.upsert({
              where: {
                submissionId_questionId: {
                  submissionId: submission.id,
                  questionId: q.id
                }
              },
              update: { selectedAnswer: selected, isCorrect },
              create: {
                submissionId: submission.id,
                questionId: q.id,
                selectedAnswer: selected,
                isCorrect
              }
            });
          } else {
            await prisma.submissionAnswer.deleteMany({
              where: {
                submissionId: submission.id,
                questionId: q.id
              }
            });
          }
        }

        // Compute scores
        const computed = computeResults(questions, answersMap, assignment.exam, finalAwardedMap);

        // Finalize submission with 3PL TRI & SIMCE Score
        await prisma.submission.update({
          where: { id: submission.id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
            autoSubmitted: false,
            correctCount: computed.correctCount,
            percent: computed.percent,
            grade: computed.grade,
            achievementLevel: computed.achievementLevel,
            simceScore: computed.simceScore,
            theta: computed.theta,
            seTheta: computed.seTheta
          }
        });

        results.imported++;
      } catch (err) {
        results.errors.push({ row: rowNumber, rut, error: err.message });
      }
    }

    res.json(results);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Calificación Manual de Preguntas Abiertas (Desarrollo Escrito / Oral)
// ==========================================
router.post('/assignments/:id/grade-open-questions', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { studentRut, scores } = req.body;
    if (!studentRut || !scores || typeof scores !== 'object') {
      return res.status(400).json({ error: 'Debe especificar el RUT del estudiante y los puntajes a asignar' });
    }

    const assignment = await getAssignmentIfAllowed(id, req.user);
    const rut = normalizeRut(studentRut);

    const questions = await prisma.question.findMany({
      where: { examId: assignment.examId },
      orderBy: { questionNumber: 'asc' }
    });
    const questionsByNum = {};
    const questionsById = {};
    questions.forEach(q => {
      questionsByNum[q.questionNumber] = q;
      questionsById[q.id] = q;
    });

    let submission = await prisma.submission.findUnique({
      where: { studentRut_assignmentId: { studentRut: rut, assignmentId: assignment.id } },
      include: { answers: true }
    });

    if (!submission) {
      submission = await prisma.submission.create({
        data: {
          studentRut: rut,
          assignmentId: assignment.id,
          startedAt: new Date(),
          submittedAt: new Date(),
          status: 'SUBMITTED'
        },
        include: { answers: true }
      });
    }

    // Apply incoming scores for open questions
    for (const [key, rawPts] of Object.entries(scores)) {
      const q = questionsByNum[key] || questionsById[key];
      if (!q) continue;
      const isOpen = q.questionType === 'WRITTEN' || q.questionType === 'ORAL' || q.correctAnswer === 'DESARROLLO' || q.correctAnswer === 'ORAL';
      if (!isOpen) continue;

      if (rawPts === null || rawPts === '') {
        // Clear awardedPoints while keeping any digital text answer
        const existing = (submission.answers || []).find(a => a.questionId === q.id);
        if (existing) {
          if (existing.selectedAnswer) {
            await prisma.submissionAnswer.update({
              where: { id: existing.id },
              data: { awardedPoints: null, isCorrect: null }
            });
          } else {
            await prisma.submissionAnswer.delete({ where: { id: existing.id } });
          }
        }
        continue;
      }

      const num = parseFloat(String(rawPts).replace(',', '.'));
      if (isNaN(num)) continue;
      const maxPts = q.maxPoints != null && q.maxPoints > 0 ? Number(q.maxPoints) : 1;
      const clampedPts = Math.round(Math.max(0, Math.min(maxPts, num)) * 100) / 100;
      const isCorrect = clampedPts >= maxPts;

      await prisma.submissionAnswer.upsert({
        where: {
          submissionId_questionId: {
            submissionId: submission.id,
            questionId: q.id
          }
        },
        update: {
          awardedPoints: clampedPts,
          isCorrect
        },
        create: {
          submissionId: submission.id,
          questionId: q.id,
          selectedAnswer: null,
          awardedPoints: clampedPts,
          isCorrect
        }
      });
    }

    // Reload all answers for this submission and recompute total score & grade
    const allAnswers = await prisma.submissionAnswer.findMany({
      where: { submissionId: submission.id }
    });
    const answersMap = Object.fromEntries(allAnswers.map(a => [a.questionId, a.selectedAnswer]));
    const awardedPointsMap = Object.fromEntries(
      allAnswers.filter(a => a.awardedPoints != null).map(a => [a.questionId, a.awardedPoints])
    );

    const computed = computeResults(questions, answersMap, assignment.exam, awardedPointsMap);

    const updatedSubmission = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: submission.submittedAt || new Date(),
        correctCount: computed.correctCount,
        percent: computed.percent,
        grade: computed.grade,
        achievementLevel: computed.achievementLevel,
        simceScore: computed.simceScore,
        theta: computed.theta,
        seTheta: computed.seTheta
      }
    });

    res.json({
      message: 'Puntajes guardados y nota recalculada',
      submission: {
        id: updatedSubmission.id,
        studentRut: rut,
        correctCount: updatedSubmission.correctCount,
        totalMaxPoints: computed.total,
        percent: updatedSubmission.percent,
        grade: updatedSubmission.grade,
        achievementLevel: updatedSubmission.achievementLevel,
        simceScore: updatedSubmission.simceScore,
        theta: updatedSubmission.theta
      }
    });
  } catch (error) {
    handleAssignmentError(error, res, next);
  }
});

router.patch('/assignments/:id/mode', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignment = await prisma.examAssignment.findUnique({ where: { id } });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes permisos para modificar este curso' });
    }

    const { applicationMode } = req.body;
    const mode = applicationMode === 'PRINTED' ? 'PRINTED' : 'DIGITAL';
    const updated = await prisma.examAssignment.update({
      where: { id },
      data: { applicationMode: mode },
      include: {
        exam: true,
        course: true,
        assignedTeacher: { select: { name: true, rut: true } }
      }
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Pistas de Audio y Cortador (Asignación)
// ==========================================
router.get('/assignments/:id/audios', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignment = await prisma.examAssignment.findUnique({
      where: { id },
      include: { exam: { include: { audioClips: { orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }] } } } }
    });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const clips = (assignment.exam?.audioClips || []).map((c) => {
      let qNums = [];
      try {
        qNums = JSON.parse(c.questionNumbers || '[]');
      } catch {
        qNums = [];
      }
      return {
        ...c,
        questionNumbers: qNums
      };
    });
    res.json(clips);
  } catch (error) {
    next(error);
  }
});

router.post('/assignments/:id/audios', (req, res, next) => {
  uploadAudioDisk.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido de 15 MB' });
      }
      return res.status(400).json({ error: err.message || 'Error al subir el archivo de audio' });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignment = await prisma.examAssignment.findUnique({
      where: { id },
      include: { exam: true }
    });
    if (!assignment || !assignment.exam) return res.status(404).json({ error: 'Asignación o examen no encontrado' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes permisos para modificar este curso' });
    }

    const examId = assignment.examId;
    let audioPath = req.file ? req.file.filename : (req.body.existingAudioPath ? path.basename(req.body.existingAudioPath) : null);
    if (!audioPath) {
      return res.status(400).json({ error: 'Debes seleccionar y subir un archivo de audio (.mp3, .m4a, .ogg)' });
    }

    const fileSize = req.file ? req.file.size : 0;

    let rawClips = [];
    if (req.body.clips) {
      try {
        rawClips = typeof req.body.clips === 'string' ? JSON.parse(req.body.clips) : req.body.clips;
      } catch {
        rawClips = [];
      }
    } else {
      rawClips = [{
        title: req.body.title || 'Audio',
        startSec: req.body.startSec,
        endSec: req.body.endSec,
        questionNumbers: req.body.questionNumbers,
        maxPlays: req.body.maxPlays
      }];
    }

    if (!Array.isArray(rawClips) || rawClips.length === 0) {
      rawClips = [{ title: 'Audio General', questionNumbers: [] }];
    }

    const createdClips = [];
    for (let i = 0; i < rawClips.length; i++) {
      const c = rawClips[i];
      let qNums = [];
      if (Array.isArray(c.questionNumbers)) {
        qNums = c.questionNumbers.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
      } else if (typeof c.questionNumbers === 'string') {
        try {
          const parsed = JSON.parse(c.questionNumbers);
          if (Array.isArray(parsed)) qNums = parsed.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        } catch {
          qNums = c.questionNumbers.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
        }
      }

      const startSec = (c.startSec !== undefined && c.startSec !== null && String(c.startSec).trim() !== '')
        ? Math.max(0, parseFloat(c.startSec)) : null;
      const endSec = (c.endSec !== undefined && c.endSec !== null && String(c.endSec).trim() !== '')
        ? Math.max(0, parseFloat(c.endSec)) : null;
      const maxPlays = (c.maxPlays !== undefined && c.maxPlays !== null && String(c.maxPlays).trim() !== '')
        ? parseInt(c.maxPlays, 10) : null;

      const title = (c.title && String(c.title).trim())
        ? String(c.title).trim()
        : (qNums.length === 1 ? `Audio Pregunta ${qNums[0]}` : (qNums.length > 1 ? `Audio Preguntas ${qNums.join(', ')}` : `Pista ${i + 1}`));

      const created = await prisma.examAudioClip.create({
        data: {
          examId,
          title,
          audioPath,
          fileSize,
          startSec,
          endSec,
          questionNumbers: JSON.stringify(qNums),
          maxPlays,
          orderIndex: i + 1
        }
      });
      createdClips.push({ ...created, questionNumbers: qNums });
    }

    res.json({ message: `${createdClips.length} fragmento(s) guardado(s)`, clips: createdClips });
  } catch (error) {
    next(error);
  }
});

router.put('/assignments/:id/audios/:clipId', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const clipId = parseInt(req.params.clipId, 10);
    const assignment = await prisma.examAssignment.findUnique({ where: { id } });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes permisos para modificar este curso' });
    }

    const { title, startSec, endSec, questionNumbers, maxPlays } = req.body;
    let qNums = [];
    if (Array.isArray(questionNumbers)) {
      qNums = questionNumbers.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    } else if (typeof questionNumbers === 'string') {
      try {
        const parsed = JSON.parse(questionNumbers);
        if (Array.isArray(parsed)) qNums = parsed.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
      } catch {
        qNums = questionNumbers.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
      }
    }

    const updated = await prisma.examAudioClip.update({
      where: { id: clipId },
      data: {
        title: title ? String(title).trim() : undefined,
        startSec: (startSec !== undefined && startSec !== null && String(startSec).trim() !== '') ? Math.max(0, parseFloat(startSec)) : null,
        endSec: (endSec !== undefined && endSec !== null && String(endSec).trim() !== '') ? Math.max(0, parseFloat(endSec)) : null,
        questionNumbers: JSON.stringify(qNums),
        maxPlays: (maxPlays !== undefined && maxPlays !== null && String(maxPlays).trim() !== '') ? parseInt(maxPlays, 10) : null
      }
    });

    res.json({ ...updated, questionNumbers: qNums });
  } catch (error) {
    next(error);
  }
});

router.delete('/assignments/:id/audios/:clipId', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const clipId = parseInt(req.params.clipId, 10);
    const assignment = await prisma.examAssignment.findUnique({ where: { id } });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes permisos para modificar este curso' });
    }

    const clip = await prisma.examAudioClip.findFirst({
      where: { id: clipId, examId: assignment.examId }
    });
    if (!clip) return res.status(404).json({ error: 'Fragmento no encontrado' });

    const audioPath = clip.audioPath;
    await prisma.examAudioClip.delete({ where: { id: clipId } });

    if (audioPath) {
      const remaining = await prisma.examAudioClip.count({ where: { audioPath } });
      if (remaining === 0) {
        const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
        const filePath = path.join(uploadsDir, path.basename(audioPath));
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch {}
        }
      }
    }

    res.json({ message: 'Fragmento eliminado' });
  } catch (error) {
    next(error);
  }
});

router.get('/assignments/:id/audios/:clipId/stream', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const clipId = parseInt(req.params.clipId, 10);
    const assignment = await prisma.examAssignment.findUnique({ where: { id } });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const clip = await prisma.examAudioClip.findFirst({
      where: { id: clipId, examId: assignment.examId }
    });
    if (!clip || !clip.audioPath) return res.status(404).json({ error: 'Audio no encontrado' });

    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
    const filePath = path.join(uploadsDir, path.basename(clip.audioPath));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

    res.setHeader('Cache-Control', 'private, max-age=7200');
    return res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
