const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { prisma } = require('../lib/prisma');
const exceljs = require('exceljs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { normalizeRut } = require('../utils/rut');
const { parseSpreadsheet, createEmptyTemplate } = require('../utils/spreadsheet');
const { computeResults } = require('../services/grading');

const router = express.Router();
const uploadMemory = multer({ storage: multer.memoryStorage() });

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
      select: { rut: true, name: true }
    });

    const submissions = await prisma.submission.findMany({
      where: { assignmentId: assignment.id },
      include: { _count: { select: { answers: true } } }
    });
    const subMap = Object.fromEntries(submissions.map(s => [s.studentRut, s]));

    const result = students.map(st => {
      const sub = subMap[st.rut];
      let state = 'NOT_STARTED';
      let progress = 0;
      let submittedAt = null;
      let startedAt = null;
      
      if (sub) {
        if (sub.status === 'SUBMITTED') {
          state = 'SUBMITTED';
          submittedAt = sub.submittedAt;
        } else {
          state = 'IN_PROGRESS';
          startedAt = sub.startedAt;
        }
        // Approximate progress: answered / total questions
        // Note: exam._count.questions requires another query, we can just use sub._count.answers
      }
      
      return {
        rut: st.rut,
        name: st.name,
        state,
        startedAt,
        submittedAt,
        answersCount: sub ? sub._count.answers : 0,
        grade: sub?.grade || null,
        simceScore: sub?.simceScore || null,
        achievementLevel: sub?.achievementLevel || null
      };
    });

    res.json({
      questionCount: await prisma.question.count({ where: { examId: assignment.examId } }),
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
      if (q.skill) {
        if (!skills[q.skill]) skills[q.skill] = { correct: 0, total: 0 };
        skills[q.skill].total += submissions.length;
      }
      if (q.axis) {
        if (!axes[q.axis]) axes[q.axis] = { correct: 0, total: 0 };
        axes[q.axis].total += submissions.length;
      }
    });

    submissions.forEach(sub => {
      sub.answers.forEach(ans => {
        if (ans.isCorrect) {
          const q = questions.find(qu => qu.id === ans.questionId);
          if (q) {
            if (q.skill) skills[q.skill].correct++;
            if (q.axis) axes[q.axis].correct++;
          }
        }
      });
    });

    const formatObj = (obj) => Object.entries(obj).map(([name, data]) => ({
      name,
      correct: data.correct,
      total: data.total,
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
      
      if (!clusters[key]) {
        clusters[key] = { axis, oa, skill, correct: 0, total: 0, questionsCount: 0 };
      }
      clusters[key].total += submissions.length;
      clusters[key].questionsCount += 1;
    });

    submissions.forEach(sub => {
      sub.answers.forEach(ans => {
        const q = questions.find(qu => qu.id === ans.questionId);
        if (q && ans.isCorrect) {
          const key = `${q.axis || "Sin Eje"} || ${q.learningObjective || "Sin OA"} || ${q.skill || "Sin Habilidad"}`;
          clusters[key].correct += 1;
        }
      });
    });

    let results = Object.values(clusters).map(c => ({
      ...c,
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
      const stats = {
        questionNumber: q.questionNumber,
        skill: q.skill,
        axis: q.axis,
        correctAnswer: q.correctAnswer,
        totalAnswers: submissions.length,
        correctCount: 0,
        omittedCount: submissions.length,
        options: { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0 }
      };

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
      columns1.push({ header: `P${q.questionNumber} (${q.correctAnswer})`, key: `q_${q.id}`, width: 10 });
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
          row[`q_${a.questionId}`] = a.selectedAnswer || 'Omitida';
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
      { header: 'Respuestas Correctas', key: 'correct', width: 22 },
      { header: 'Total Oportunidades', key: 'total', width: 22 },
      { header: '% Logro del Curso', key: 'percent', width: 20 }
    ];

    const skillMap = {};
    const axisMap = {};
    questions.forEach(q => {
      if (q.skill) {
        if (!skillMap[q.skill]) skillMap[q.skill] = { questions: 0, correct: 0, total: 0 };
        skillMap[q.skill].questions += 1;
        skillMap[q.skill].total += submissions.length;
      }
      if (q.axis) {
        if (!axisMap[q.axis]) axisMap[q.axis] = { questions: 0, correct: 0, total: 0 };
        axisMap[q.axis].questions += 1;
        axisMap[q.axis].total += submissions.length;
      }
    });

    submissions.forEach(sub => {
      sub.answers.forEach(a => {
        if (a.isCorrect) {
          if (a.question?.skill && skillMap[a.question.skill]) skillMap[a.question.skill].correct += 1;
          if (a.question?.axis && axisMap[a.question.axis]) axisMap[a.question.axis].correct += 1;
        }
      });
    });

    Object.entries(skillMap).forEach(([name, st]) => {
      const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
      sheet3.addRow({ dim: 'Habilidad', name, qCount: st.questions, correct: st.correct, total: st.total, percent: `${pct}%` });
    });

    Object.entries(axisMap).forEach(([name, st]) => {
      const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
      sheet3.addRow({ dim: 'Eje Temático', name, qCount: st.questions, correct: st.correct, total: st.total, percent: `${pct}%` });
    });

    // HOJA 4: Análisis de Preguntas
    const sheet4 = workbook.addWorksheet('Análisis de Preguntas');
    sheet4.columns = [
      { header: 'N°', key: 'num', width: 8 },
      { header: 'Habilidad', key: 'skill', width: 25 },
      { header: 'Eje Temático', key: 'axis', width: 25 },
      { header: 'Clave', key: 'correctAnswer', width: 10 },
      { header: 'Correctas', key: 'correctCount', width: 12 },
      { header: 'Total', key: 'total', width: 12 },
      { header: '% Logro', key: 'percent', width: 12 },
      { header: 'A', key: 'optA', width: 8 },
      { header: 'B', key: 'optB', width: 8 },
      { header: 'C', key: 'optC', width: 8 },
      { header: 'D', key: 'optD', width: 8 },
      { header: 'Omitidas', key: 'omitted', width: 10 }
    ];

    questions.forEach(q => {
      let correctCount = 0;
      const opts = { A: 0, B: 0, C: 0, D: 0 };
      let omitted = 0;

      submissions.forEach(sub => {
        const ans = sub.answers.find(a => a.questionId === q.id);
        if (ans && ans.selectedAnswer) {
          if (opts[ans.selectedAnswer] !== undefined) opts[ans.selectedAnswer]++;
          if (ans.isCorrect) correctCount++;
        } else {
          omitted++;
        }
      });

      const totalAns = submissions.length;
      const pct = totalAns > 0 ? Math.round((correctCount / totalAns) * 100) : 0;

      sheet4.addRow({
        num: q.questionNumber,
        skill: q.skill || 'Sin habilidad',
        axis: q.axis || 'Sin eje',
        correctAnswer: q.correctAnswer,
        correctCount,
        total: totalAns,
        percent: `${pct}%`,
        optA: opts.A,
        optB: opts.B,
        optC: opts.C,
        optD: opts.D,
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
// Plantilla de Respuestas para Escáner / Papel (.xlsx)
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
        course: true
      }
    });
    if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });

    const allowedCourses = await getAllowedCourseIds(req.user);
    if (allowedCourses && !allowedCourses.includes(assignment.courseId)) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const columns = [
      { header: 'RUT', key: 'rut', width: 16 },
      { header: 'Nombre', key: 'name', width: 30 }
    ];

    assignment.exam.questions.forEach(q => {
      columns.push({
        header: `P${q.questionNumber}`,
        key: `p${q.questionNumber}`,
        width: 8
      });
    });

    const buffer = await createEmptyTemplate(columns, `Respuestas_${assignment.id}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Formato_Respuestas_Ensayo_${assignment.id}.xlsx"`);
    res.send(buffer);
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

    // Map column headers (e.g., P1, P2... or index based)
    const headerRow = worksheet.getRow(1);
    const colToQNum = {};
    for (let c = 1; c <= headerRow.cellCount; c++) {
      const headerVal = String(headerRow.getCell(c).text || '').trim().toUpperCase();
      const match = headerVal.match(/^P?(\d+)$/);
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

        // Map answers
        const answersMap = {};
        if (Object.keys(colToQNum).length > 0) {
          for (const [colIdx, qNum] of Object.entries(colToQNum)) {
            const q = questionsByNum[qNum];
            if (q) {
              const val = String(row.getCell(parseInt(colIdx, 10)).text || '').trim().toUpperCase();
              if (val && val !== '-') {
                answersMap[q.id] = val;
              }
            }
          }
        } else {
          // Fallback: columns 3 onwards are questions in order
          questions.forEach((q, idx) => {
            const val = String(row.getCell(3 + idx).text || '').trim().toUpperCase();
            if (val && val !== '-') {
              answersMap[q.id] = val;
            }
          });
        }

        // Upsert Submission
        let submission = await prisma.submission.findUnique({
          where: { studentRut_assignmentId: { studentRut: rut, assignmentId: assignment.id } }
        });

        if (!submission) {
          submission = await prisma.submission.create({
            data: {
              studentRut: rut,
              assignmentId: assignment.id,
              startedAt: new Date(),
              status: 'IN_PROGRESS'
            }
          });
        }

        // Upsert Answers
        for (const q of questions) {
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
        const computed = computeResults(questions, answersMap, assignment.exam);

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

module.exports = router;
