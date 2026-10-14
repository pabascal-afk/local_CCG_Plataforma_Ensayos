const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { prisma } = require('../lib/prisma');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const exceljs = require('exceljs');
const { normalizeRut } = require('../utils/rut');
const { parseSpreadsheet, createEmptyTemplate } = require('../utils/spreadsheet');

const router = express.Router();
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Middleware común
router.use(requireAuth);
router.use(requireRole('ADMIN', 'DIRECTOR'));

const checkAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Solo los administradores pueden hacer modificaciones' });
  }
  next();
};

function normalizeRole(val) {
  const v = String(val || '').trim().toUpperCase();
  if (['ESTUDIANTE', 'ALUMNO', 'STUDENT'].includes(v)) return 'STUDENT';
  if (['PROFESOR', 'PROFESORA', 'DOCENTE', 'TEACHER'].includes(v)) return 'TEACHER';
  if (['DIRECTOR', 'DIRECTORA', 'DIRECTIVO', 'UTP', 'JEFE_UTP'].includes(v)) return 'DIRECTOR';
  if (['ADMIN', 'ADMINISTRADOR'].includes(v)) return 'ADMIN';
  return 'STUDENT';
}

// ==========================================
// PLANTILLAS VACÍAS (FORMATOS DE SUBIDA .xlsx)
// ==========================================
router.get('/templates/users.xlsx', async (req, res, next) => {
  try {
    const columns = [
      { header: 'RUT', key: 'rut', width: 16 },
      { header: 'Nombre', key: 'name', width: 32 },
      { header: 'Nivel', key: 'level', width: 12 },
      { header: 'Enseñanza', key: 'teaching', width: 16 },
      { header: 'Letra', key: 'letter', width: 10 },
      { header: 'Año', key: 'year', width: 12 },
      { header: 'Rol', key: 'role', width: 14 }
    ];
    const buffer = await createEmptyTemplate(columns, 'Formato_Usuarios');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Formato_Usuarios.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/templates/courses.xlsx', async (req, res, next) => {
  try {
    const columns = [
      { header: 'Nivel', key: 'level', width: 12 },
      { header: 'Enseñanza', key: 'teaching', width: 16 },
      { header: 'Letra', key: 'letter', width: 10 },
      { header: 'Año', key: 'year', width: 12 }
    ];
    const buffer = await createEmptyTemplate(columns, 'Formato_Cursos');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Formato_Cursos.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/templates/exam_questions.xlsx', async (req, res, next) => {
  try {
    const columns = [
      { header: 'Numero', key: 'number', width: 10 },
      { header: 'Clave', key: 'key', width: 10 },
      { header: 'Habilidad', key: 'skill', width: 28 },
      { header: 'Eje', key: 'axis', width: 28 },
      { header: 'OA', key: 'oa', width: 16 },
      { header: 'Dificultad', key: 'difficulty', width: 16 }
    ];
    const buffer = await createEmptyTemplate(columns, 'Formato_Pauta');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Formato_Pauta_Ensayo.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/templates/assignments.xlsx', async (req, res, next) => {
  try {
    const columns = [
      { header: 'IdEnsayo', key: 'examId', width: 12 },
      { header: 'Nivel', key: 'level', width: 12 },
      { header: 'Letra', key: 'letter', width: 10 },
      { header: 'RutProfesor', key: 'teacherRut', width: 16 },
      { header: 'FechaApertura', key: 'opensAt', width: 22 },
      { header: 'FechaCierre', key: 'closesAt', width: 22 }
    ];
    const buffer = await createEmptyTemplate(columns, 'Formato_Asignaciones');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Formato_Asignaciones.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// =======================
// DASHBOARD (GLOBAL)
// =======================
router.get('/dashboard', async (req, res, next) => {
  try {
    const { year, subject, examType, courseId, level, orderNumbers } = req.query;
    const yearFilter = year ? parseInt(year, 10) : undefined;
    const courseIdFilter = courseId ? parseInt(courseId, 10) : undefined;
    const orderNums = orderNumbers ? String(orderNumbers).split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)) : undefined;

    const studentsWhere = yearFilter ? { role: 'STUDENT', course: { year: yearFilter } } : { role: 'STUDENT' };
    const students = await prisma.user.count({ where: studentsWhere });
    const teachers = await prisma.user.count({ where: { role: 'TEACHER' } });

    const subWhere = { status: 'SUBMITTED', assignment: {} };
    if (yearFilter) {
      subWhere.assignment.course = { year: yearFilter };
    }
    if (level && level !== 'TODOS') {
      if (!subWhere.assignment.course) subWhere.assignment.course = {};
      subWhere.assignment.course.level = level;
    }
    if (courseIdFilter) {
      subWhere.assignment.courseId = courseIdFilter;
    }
    if (subject && subject !== 'TODOS') {
      if (!subWhere.assignment.exam) subWhere.assignment.exam = {};
      subWhere.assignment.exam.subject = subject;
    }
    if (examType && examType !== 'TODOS') {
      if (!subWhere.assignment.exam) subWhere.assignment.exam = {};
      subWhere.assignment.exam.examType = examType;
    }
    if (orderNums && orderNums.length > 0) {
      if (!subWhere.assignment.exam) subWhere.assignment.exam = {};
      subWhere.assignment.exam.orderNumber = { in: orderNums };
    }

    if (Object.keys(subWhere.assignment).length === 0) {
      delete subWhere.assignment;
    }

    const submissions = await prisma.submission.count({ where: subWhere });

    // Obtener todas las entregas con la info del assignment y curso
    const allSubmissions = await prisma.submission.findMany({
      where: subWhere,
      include: {
        answers: true,
        assignment: {
          include: {
            course: true,
            exam: {
              include: { questions: true }
            }
          }
        }
      }
    });

    // Construir la data para el Mapa de Calor (Heatmap)
    const heatmap = {}; // { "4B": { "OA 4": { "4B-A": { correct: X, total: Y } } } }

    allSubmissions.forEach(sub => {
      const lvl = sub.assignment.course.level; // ej "4B"
      const lvlFormatted = lvl.replace('B', '° Básico').replace('M', '° Medio');
      const courseName = `${lvlFormatted} ${sub.assignment.course.letter}`;
      const questions = sub.assignment.exam.questions;

      if (!heatmap[lvl]) heatmap[lvl] = {};

      sub.answers.forEach(ans => {
        const q = questions.find(qu => qu.id === ans.questionId);
        if (q && q.learningObjective) {
          const oa = q.learningObjective;
          if (!heatmap[lvl][oa]) heatmap[lvl][oa] = {};
          if (!heatmap[lvl][oa][courseName]) heatmap[lvl][oa][courseName] = { correct: 0, total: 0 };

          heatmap[lvl][oa][courseName].total += 1;
          if (ans.isCorrect) heatmap[lvl][oa][courseName].correct += 1;
        }
      });
    });

    const heatmapData = {};
    for (const [lvl, oas] of Object.entries(heatmap)) {
      heatmapData[lvl] = [];
      for (const [oa, courses] of Object.entries(oas)) {
        const row = { oa };
        for (const [courseName, stats] of Object.entries(courses)) {
          row[courseName] = Math.round((stats.correct / stats.total) * 100);
        }
        heatmapData[lvl].push(row);
      }
    }

    // Construir la data para Evolución Longitudinal por Nivel
    const evolution = {};
    allSubmissions.forEach(sub => {
      const lvl = sub.assignment.course.level;
      const lvlFormatted = lvl.replace('B', '° Básico').replace('M', '° Medio');
      const courseName = `${lvlFormatted} ${sub.assignment.course.letter}`;
      const examId = sub.assignment.examId;
      const examTitle = sub.assignment.exam.title;
      const examTypeVal = sub.assignment.exam.examType;
      const orderNumberVal = sub.assignment.exam.orderNumber;
      const subjectVal = sub.assignment.exam.subject;
      const date = sub.assignment.opensAt;
      const score = sub.simceScore || (sub.percent ? Math.round(250 + (sub.percent - 50) * 2) : 250);
      const grade = sub.grade || 1.0;
      const percent = sub.percent != null ? sub.percent : 0;
      const achLevel = sub.achievementLevel || 'ELEMENTAL';

      if (!evolution[lvl]) evolution[lvl] = {};
      if (!evolution[lvl][examId]) {
        evolution[lvl][examId] = {
          examId,
          examTitle,
          orderNumber: orderNumberVal,
          examType: examTypeVal,
          subject: subjectVal,
          date,
          totalSimce: 0,
          totalGrade: 0,
          totalPercent: 0,
          count: 0,
          levels: { INSUFICIENTE: 0, ELEMENTAL: 0, ADECUADO: 0 },
          courses: {}
        };
      }
      const entry = evolution[lvl][examId];
      entry.totalSimce += score;
      entry.totalGrade += grade;
      entry.totalPercent += percent;
      entry.count++;
      if (entry.levels[achLevel] !== undefined) entry.levels[achLevel]++;

      if (!entry.courses[courseName]) entry.courses[courseName] = { totalSimce: 0, totalGrade: 0, count: 0 };
      entry.courses[courseName].totalSimce += score;
      entry.courses[courseName].totalGrade += grade;
      entry.courses[courseName].count++;
    });

    const evolutionData = {};
    for (const [lvl, examsMap] of Object.entries(evolution)) {
      evolutionData[lvl] = Object.values(examsMap)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(e => {
          const courseScores = {};
          for (const [cName, cStats] of Object.entries(e.courses)) {
            courseScores[cName] = {
              avgSimce: Math.round(cStats.totalSimce / cStats.count),
              avgGrade: Number((cStats.totalGrade / cStats.count).toFixed(1)),
              count: cStats.count
            };
          }
          return {
            examId: e.examId,
            examTitle: e.examTitle,
            orderNumber: e.orderNumber,
            examType: e.examType,
            subject: e.subject,
            date: e.date,
            avgSimce: Math.round(e.totalSimce / e.count),
            avgGrade: Number((e.totalGrade / e.count).toFixed(1)),
            avgPercent: Math.round(e.totalPercent / e.count),
            count: e.count,
            levels: e.levels,
            courses: courseScores
          };
        });
    }

    // Metadatos de filtros para el frontend
    const allExams = await prisma.exam.findMany({
      select: { id: true, title: true, subject: true, level: true, examType: true, orderNumber: true }
    });
    const allCourses = await prisma.course.findMany({
      where: yearFilter ? { year: yearFilter } : undefined,
      select: { id: true, level: true, letter: true, year: true },
      orderBy: [{ level: 'asc' }, { letter: 'asc' }]
    });

    const availableSubjects = Array.from(new Set(allExams.map(e => e.subject))).filter(Boolean);
    const availableExamTypes = Array.from(new Set(allExams.map(e => e.examType))).filter(Boolean);
    const availableLevels = Array.from(new Set(allCourses.map(c => c.level))).filter(Boolean);
    const availableOrderNumbers = Array.from(new Set(allExams.map(e => e.orderNumber))).filter(Boolean).sort((a, b) => a - b);

    res.json({
      stats: { students, teachers, submissions },
      heatmap: heatmapData,
      evolution: evolutionData,
      filters: {
        availableSubjects,
        availableExamTypes,
        availableLevels,
        availableCourses: allCourses,
        availableOrderNumbers
      }
    });
  } catch (error) {
    next(error);
  }
});

// =======================
// TRAYECTORIA MULTIANUAL (GLOBAL)
// =======================
router.get('/dashboard/multiannual', async (req, res, next) => {
  try {
    const { level, subject, examType, courseLetter, orderNumbers } = req.query;
    const orderNums = orderNumbers ? String(orderNumbers).split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)) : undefined;

    const subWhere = { status: 'SUBMITTED', assignment: {} };
    if (level && level !== 'TODOS') {
      if (!subWhere.assignment.course) subWhere.assignment.course = {};
      subWhere.assignment.course.level = level;
    }
    if (courseLetter && courseLetter !== 'TODOS') {
      if (!subWhere.assignment.course) subWhere.assignment.course = {};
      subWhere.assignment.course.letter = courseLetter.toUpperCase();
    }
    if (subject && subject !== 'TODOS') {
      if (!subWhere.assignment.exam) subWhere.assignment.exam = {};
      subWhere.assignment.exam.subject = subject;
    }
    if (examType && examType !== 'TODOS') {
      if (!subWhere.assignment.exam) subWhere.assignment.exam = {};
      subWhere.assignment.exam.examType = examType;
    }
    if (orderNums && orderNums.length > 0) {
      if (!subWhere.assignment.exam) subWhere.assignment.exam = {};
      subWhere.assignment.exam.orderNumber = { in: orderNums };
    }

    if (Object.keys(subWhere.assignment).length === 0) {
      delete subWhere.assignment;
    }

    const allSubmissions = await prisma.submission.findMany({
      where: subWhere,
      include: {
        assignment: {
          include: {
            course: true,
            exam: true
          }
        }
      }
    });

    // Agrupar por año escolar
    const yearsMap = {};

    allSubmissions.forEach(sub => {
      const year = sub.assignment.course.year;
      const cLevel = sub.assignment.course.level;
      const cLetter = sub.assignment.course.letter;
      const cKey = `${cLevel.replace('B', '° Básico').replace('M', '° Medio')} ${cLetter}`;
      const examTitle = sub.assignment.exam.title;
      const examOrder = sub.assignment.exam.orderNumber;
      const score = sub.simceScore || (sub.percent ? Math.round(250 + (sub.percent - 50) * 2) : 250);
      const grade = sub.grade || 1.0;
      const percent = sub.percent != null ? sub.percent : 0;
      const ach = sub.achievementLevel || 'ELEMENTAL';

      if (!yearsMap[year]) {
        yearsMap[year] = {
          year,
          totalSubmissions: 0,
          studentRuts: new Set(),
          totalSimce: 0,
          totalGrade: 0,
          totalPercent: 0,
          levels: { INSUFICIENTE: 0, ELEMENTAL: 0, ADECUADO: 0 },
          byLevel: {},
          byCourse: {},
          byExam: {}
        };
      }

      const yEntry = yearsMap[year];
      yEntry.totalSubmissions++;
      yEntry.studentRuts.add(sub.studentRut);
      yEntry.totalSimce += score;
      yEntry.totalGrade += grade;
      yEntry.totalPercent += percent;
      if (yEntry.levels[ach] !== undefined) yEntry.levels[ach]++;

      // Por Nivel
      if (!yEntry.byLevel[cLevel]) yEntry.byLevel[cLevel] = { totalSimce: 0, count: 0 };
      yEntry.byLevel[cLevel].totalSimce += score;
      yEntry.byLevel[cLevel].count++;

      // Por Curso
      if (!yEntry.byCourse[cKey]) yEntry.byCourse[cKey] = { totalSimce: 0, totalGrade: 0, count: 0 };
      yEntry.byCourse[cKey].totalSimce += score;
      yEntry.byCourse[cKey].totalGrade += grade;
      yEntry.byCourse[cKey].count++;

      // Por Ensayo
      const examKey = `${examOrder || 1}_${examTitle}`;
      if (!yEntry.byExam[examKey]) yEntry.byExam[examKey] = { title: examTitle, orderNumber: examOrder, totalSimce: 0, count: 0 };
      yEntry.byExam[examKey].totalSimce += score;
      yEntry.byExam[examKey].count++;
    });

    const yearlyData = Object.values(yearsMap)
      .sort((a, b) => a.year - b.year)
      .map(y => {
        const count = y.totalSubmissions;
        const insPct = count ? Math.round((y.levels.INSUFICIENTE / count) * 100) : 0;
        const elePct = count ? Math.round((y.levels.ELEMENTAL / count) * 100) : 0;
        const adePct = count ? Math.round((y.levels.ADECUADO / count) * 100) : 0;

        const coursesBreakdown = {};
        for (const [cName, cStats] of Object.entries(y.byCourse)) {
          coursesBreakdown[cName] = {
            avgSimce: Math.round(cStats.totalSimce / cStats.count),
            avgGrade: Number((cStats.totalGrade / cStats.count).toFixed(1)),
            count: cStats.count
          };
        }

        const levelsBreakdown = {};
        for (const [lvlName, lStats] of Object.entries(y.byLevel)) {
          levelsBreakdown[lvlName] = Math.round(lStats.totalSimce / lStats.count);
        }

        const examsList = Object.values(y.byExam)
          .sort((a, b) => a.orderNumber - b.orderNumber)
          .map(e => ({
            title: e.title,
            orderNumber: e.orderNumber,
            avgSimce: Math.round(e.totalSimce / e.count),
            count: e.count
          }));

        return {
          year: y.year,
          submissionsCount: count,
          studentsCount: y.studentRuts.size,
          avgSimce: count ? Math.round(y.totalSimce / count) : 0,
          avgGrade: count ? Number((y.totalGrade / count).toFixed(1)) : 0,
          avgPercent: count ? Math.round(y.totalPercent / count) : 0,
          levels: {
            ...y.levels,
            insPct,
            elePct,
            adePct
          },
          byCourse: coursesBreakdown,
          byLevel: levelsBreakdown,
          exams: examsList
        };
      });

    let deltaSimce = 0;
    if (yearlyData.length >= 2) {
      deltaSimce = yearlyData[yearlyData.length - 1].avgSimce - yearlyData[0].avgSimce;
    }

    res.json({
      yearly: yearlyData,
      deltaSimce,
      yearsCount: yearlyData.length
    });
  } catch (error) {
    next(error);
  }
});

// Exportar Reporte de Trayectoria Multianual a Excel
router.get('/dashboard/multiannual/export.xlsx', async (req, res, next) => {
  try {
    const { level, subject, examType, courseLetter, orderNumbers } = req.query;
    const orderNums = orderNumbers ? String(orderNumbers).split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)) : undefined;

    const subWhere = { status: 'SUBMITTED', assignment: {} };
    if (level && level !== 'TODOS') {
      if (!subWhere.assignment.course) subWhere.assignment.course = {};
      subWhere.assignment.course.level = level;
    }
    if (courseLetter && courseLetter !== 'TODOS') {
      if (!subWhere.assignment.course) subWhere.assignment.course = {};
      subWhere.assignment.course.letter = courseLetter.toUpperCase();
    }
    if (subject && subject !== 'TODOS') {
      if (!subWhere.assignment.exam) subWhere.assignment.exam = {};
      subWhere.assignment.exam.subject = subject;
    }
    if (examType && examType !== 'TODOS') {
      if (!subWhere.assignment.exam) subWhere.assignment.exam = {};
      subWhere.assignment.exam.examType = examType;
    }
    if (orderNums && orderNums.length > 0) {
      if (!subWhere.assignment.exam) subWhere.assignment.exam = {};
      subWhere.assignment.exam.orderNumber = { in: orderNums };
    }

    if (Object.keys(subWhere.assignment).length === 0) {
      delete subWhere.assignment;
    }

    const allSubmissions = await prisma.submission.findMany({
      where: subWhere,
      include: {
        assignment: {
          include: {
            course: true,
            exam: true
          }
        }
      }
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Concepción de Chillán';

    // HOJA 1: Resumen Multianual por Año
    const sheet1 = workbook.addWorksheet('Resumen Multianual');
    sheet1.columns = [
      { header: 'Año Escolar', key: 'year', width: 14 },
      { header: 'Evaluados', key: 'students', width: 14 },
      { header: 'Entregas', key: 'submissions', width: 14 },
      { header: 'Puntaje SIMCE', key: 'avgSimce', width: 16 },
      { header: 'Nota Promedio', key: 'avgGrade', width: 15 },
      { header: '% Logro Promedio', key: 'avgPercent', width: 18 },
      { header: '% Adecuado', key: 'adecuado', width: 14 },
      { header: '% Elemental', key: 'elemental', width: 14 },
      { header: '% Insuficiente', key: 'insuficiente', width: 14 }
    ];

    const yearsMap = {};
    allSubmissions.forEach(sub => {
      const year = sub.assignment.course.year;
      const score = sub.simceScore || (sub.percent ? Math.round(250 + (sub.percent - 50) * 2) : 250);
      const grade = sub.grade || 1.0;
      const percent = sub.percent != null ? sub.percent : 0;
      const ach = sub.achievementLevel || 'ELEMENTAL';

      if (!yearsMap[year]) {
        yearsMap[year] = {
          year,
          submissions: 0,
          studentRuts: new Set(),
          totalSimce: 0,
          totalGrade: 0,
          totalPercent: 0,
          levels: { INSUFICIENTE: 0, ELEMENTAL: 0, ADECUADO: 0 },
          courses: {}
        };
      }
      const yEntry = yearsMap[year];
      yEntry.submissions++;
      yEntry.studentRuts.add(sub.studentRut);
      yEntry.totalSimce += score;
      yEntry.totalGrade += grade;
      yEntry.totalPercent += percent;
      if (yEntry.levels[ach] !== undefined) yEntry.levels[ach]++;

      const cLvl = sub.assignment.course.level.replace('B', '° Básico').replace('M', '° Medio');
      const cKey = `${cLvl} ${sub.assignment.course.letter}`;
      if (!yEntry.courses[cKey]) yEntry.courses[cKey] = { totalSimce: 0, totalGrade: 0, count: 0 };
      yEntry.courses[cKey].totalSimce += score;
      yEntry.courses[cKey].totalGrade += grade;
      yEntry.courses[cKey].count++;
    });

    Object.values(yearsMap).sort((a, b) => a.year - b.year).forEach(y => {
      const count = y.submissions;
      sheet1.addRow({
        year: y.year,
        students: y.studentRuts.size,
        submissions: count,
        avgSimce: count ? Math.round(y.totalSimce / count) : 0,
        avgGrade: count ? (y.totalGrade / count).toFixed(1) : '0.0',
        avgPercent: count ? `${Math.round(y.totalPercent / count)}%` : '0%',
        adecuado: count ? `${Math.round((y.levels.ADECUADO / count) * 100)}%` : '0%',
        elemental: count ? `${Math.round((y.levels.ELEMENTAL / count) * 100)}%` : '0%',
        insuficiente: count ? `${Math.round((y.levels.INSUFICIENTE / count) * 100)}%` : '0%'
      });
    });

    // HOJA 2: Desglose por Curso y Año
    const sheet2 = workbook.addWorksheet('Desglose por Curso');
    sheet2.columns = [
      { header: 'Año Escolar', key: 'year', width: 14 },
      { header: 'Curso', key: 'course', width: 14 },
      { header: 'Evaluados', key: 'count', width: 14 },
      { header: 'Puntaje SIMCE', key: 'avgSimce', width: 16 },
      { header: 'Nota Promedio', key: 'avgGrade', width: 15 }
    ];

    Object.values(yearsMap).sort((a, b) => a.year - b.year).forEach(y => {
      Object.entries(y.courses).forEach(([cName, cStats]) => {
        sheet2.addRow({
          year: y.year,
          course: cName,
          count: cStats.count,
          avgSimce: Math.round(cStats.totalSimce / cStats.count),
          avgGrade: (cStats.totalGrade / cStats.count).toFixed(1)
        });
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Trayectoria_Multianual_CCG.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// Exportar Reporte Global de Dirección a Excel
router.get('/dashboard/export.xlsx', async (req, res, next) => {
  try {
    const allSubmissions = await prisma.submission.findMany({
      where: { status: 'SUBMITTED' },
      include: {
        answers: true,
        assignment: {
          include: {
            course: true,
            exam: {
              include: { questions: true }
            }
          }
        }
      }
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Concepción de Chillán';

    // HOJA 1: Resumen Institucional
    const sheet1 = workbook.addWorksheet('Resumen Institucional');
    sheet1.columns = [
      { header: 'Nivel', key: 'level', width: 12 },
      { header: 'Curso', key: 'course', width: 14 },
      { header: 'Asignatura', key: 'subject', width: 22 },
      { header: 'Ensayo', key: 'exam', width: 35 },
      { header: 'Evaluados', key: 'evaluated', width: 14 },
      { header: 'Nota Promedio', key: 'avgGrade', width: 15 },
      { header: 'Puntaje SIMCE', key: 'avgSimce', width: 16 },
      { header: '% Logro', key: 'avgPercent', width: 14 },
      { header: '% Adecuado', key: 'adecuado', width: 14 },
      { header: '% Elemental', key: 'elemental', width: 14 },
      { header: '% Insuficiente', key: 'insuficiente', width: 14 }
    ];

    const byAssignment = {};
    allSubmissions.forEach(sub => {
      const aId = sub.assignmentId;
      if (!byAssignment[aId]) {
        byAssignment[aId] = {
          assignment: sub.assignment,
          subs: []
        };
      }
      byAssignment[aId].subs.push(sub);
    });

    Object.values(byAssignment).forEach(({ assignment, subs }) => {
      const count = subs.length;
      const avgG = count > 0 ? (subs.reduce((acc, s) => acc + (s.grade || 1.0), 0) / count).toFixed(1) : '0.0';
      const simceSubs = subs.filter(s => s.simceScore != null);
      const avgS = simceSubs.length > 0 ? Math.round(simceSubs.reduce((acc, s) => acc + s.simceScore, 0) / simceSubs.length) : 'N/A';
      const avgP = count > 0 ? Math.round(subs.reduce((acc, s) => acc + (s.percent || 0), 0) / count) : 0;

      const adec = count > 0 ? Math.round((subs.filter(s => s.achievementLevel === 'ADECUADO').length / count) * 100) : 0;
      const elem = count > 0 ? Math.round((subs.filter(s => s.achievementLevel === 'ELEMENTAL').length / count) * 100) : 0;
      const insuf = count > 0 ? Math.round((subs.filter(s => s.achievementLevel === 'INSUFICIENTE').length / count) * 100) : 0;

      sheet1.addRow({
        level: assignment.course.level.replace('B', '° Básico').replace('M', '° Medio'),
        course: `${assignment.course.level.replace('B', '° Básico').replace('M', '° Medio')} ${assignment.course.letter}`,
        subject: assignment.exam.subject,
        exam: assignment.exam.title,
        evaluated: count,
        avgGrade: avgG,
        avgSimce: avgS,
        avgPercent: `${avgP}%`,
        adecuado: `${adec}%`,
        elemental: `${elem}%`,
        insuficiente: `${insuf}%`
      });
    });

    // HOJA 2: Mapa de Calor (OAs)
    const sheet2 = workbook.addWorksheet('Mapa de Calor OAs');
    sheet2.columns = [
      { header: 'Nivel', key: 'level', width: 12 },
      { header: 'Objetivo de Aprendizaje (OA)', key: 'oa', width: 35 },
      { header: 'Curso', key: 'course', width: 14 },
      { header: 'Correctas', key: 'correct', width: 14 },
      { header: 'Total', key: 'total', width: 14 },
      { header: '% Logro', key: 'percent', width: 14 }
    ];

    const oaStats = {};
    allSubmissions.forEach(sub => {
      const level = sub.assignment.course.level;
      const levelFormatted = level.replace('B', '° Básico').replace('M', '° Medio');
      const courseName = `${levelFormatted} ${sub.assignment.course.letter}`;
      const questions = sub.assignment.exam.questions;

      sub.answers.forEach(ans => {
        const q = questions.find(qu => qu.id === ans.questionId);
        if (q && q.learningObjective) {
          const key = `${level}|${q.learningObjective}|${courseName}`;
          if (!oaStats[key]) {
            oaStats[key] = { level: levelFormatted, oa: q.learningObjective, course: courseName, correct: 0, total: 0 };
          }
          oaStats[key].total += 1;
          if (ans.isCorrect) oaStats[key].correct += 1;
        }
      });
    });

    Object.values(oaStats).forEach(s => {
      const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      sheet2.addRow({
        level: s.level,
        oa: s.oa,
        course: s.course,
        correct: s.correct,
        total: s.total,
        percent: `${pct}%`
      });
    });

    // HOJA 3: Evolución Longitudinal
    const sheet3 = workbook.addWorksheet('Evolución Longitudinal');
    sheet3.columns = [
      { header: 'Nivel', key: 'level', width: 14 },
      { header: 'Evaluación / Ensayo', key: 'exam', width: 35 },
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Promedio SIMCE Cohorte', key: 'avgSimce', width: 24 }
    ];

    const evoMap = {};
    allSubmissions.forEach(sub => {
      const level = sub.assignment.course.level;
      const levelFormatted = level.replace('B', '° Básico').replace('M', '° Medio');
      const examTitle = sub.assignment.exam.title;
      const key = `${level}|${examTitle}`;
      if (!evoMap[key]) {
        evoMap[key] = {
          level: levelFormatted,
          exam: examTitle,
          date: sub.assignment.opensAt,
          scores: []
        };
      }
      if (sub.simceScore != null) {
        evoMap[key].scores.push(sub.simceScore);
      }
    });

    Object.values(evoMap)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach(e => {
        const avg = e.scores.length > 0 ? Math.round(e.scores.reduce((a, b) => a + b, 0) / e.scores.length) : 'N/A';
        sheet3.addRow({
          level: e.level,
          exam: e.exam,
          date: new Date(e.date).toLocaleDateString('es-CL'),
          avgSimce: avg
        });
      });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Reporte_Directivo_SIMCE.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// =======================
// CURSOS
// =======================
router.get('/courses', async (req, res, next) => {
  try {
    const yearFilter = req.query.year ? parseInt(req.query.year, 10) : undefined;
    const courses = await prisma.course.findMany({
      where: yearFilter ? { year: yearFilter } : undefined,
      orderBy: [{ year: 'desc' }, { level: 'asc' }, { letter: 'asc' }],
    });
    res.json(courses);
  } catch (error) {
    next(error);
  }
});

// Exportar Cursos a Excel
router.get('/courses/export.xlsx', async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      include: { _count: { select: { students: true } } },
      orderBy: [{ year: 'desc' }, { level: 'asc' }, { letter: 'asc' }]
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Concepción de Chillán';
    const sheet = workbook.addWorksheet('Cursos');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Año', key: 'year', width: 12 },
      { header: 'Nivel', key: 'level', width: 14 },
      { header: 'Letra', key: 'letter', width: 10 },
      { header: 'Nombre Completo', key: 'fullName', width: 22 },
      { header: 'Matrícula Estudiantes', key: 'studentCount', width: 22 }
    ];

    courses.forEach(c => {
      sheet.addRow({
        id: c.id,
        year: c.year,
        level: c.level,
        letter: c.letter,
        fullName: `${c.level.replace('B', '° Básico').replace('M', '° Medio')} ${c.letter}`,
        studentCount: c._count.students
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Cursos_CCG.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

router.post('/courses', checkAdmin, async (req, res, next) => {
  try {
    let { year, level, letter, nivel, ensenanza } = req.body;
    if (nivel !== undefined && ensenanza !== undefined) {
      const nivelNum = String(nivel).replace(/[^0-9]/g, '');
      const ens = String(ensenanza).toUpperCase().includes('M') ? 'M' : 'B';
      level = `${nivelNum}${ens}`;
    }
    const yearNum = parseInt(year, 10) || new Date().getFullYear();
    const course = await prisma.course.create({
      data: { year: yearNum, level: level.toUpperCase(), letter: letter.toUpperCase() },
    });
    res.json(course);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'El curso ya existe' });
    next(error);
  }
});

router.put('/courses/:id', checkAdmin, async (req, res, next) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    const { year, level, letter } = req.body;
    const course = await prisma.course.update({
      where: { id: courseId },
      data: { year, level, letter },
    });
    res.json(course);
  } catch (error) {
    next(error);
  }
});

router.delete('/courses/:id', checkAdmin, async (req, res, next) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    await prisma.course.delete({ where: { id: courseId } });
    res.json({ message: 'Curso eliminado' });
  } catch (error) {
    next(error);
  }
});

// Importar Cursos desde Excel o CSV
router.post('/courses/import', checkAdmin, uploadMemory.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo para importar' });

  let worksheet;
  try {
    worksheet = await parseSpreadsheet(req.file.buffer, req.file.originalname);
  } catch (parseErr) {
    return res.status(400).json({ error: parseErr.message || 'No se pudo leer el archivo Excel o CSV' });
  }

  try {
    const results = { imported: 0, errors: [] };

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const col1 = String(row.getCell(1).text || row.getCell(1).value || '').trim();
        const col2 = String(row.getCell(2).text || row.getCell(2).value || '').trim();
        const col3 = String(row.getCell(3).text || row.getCell(3).value || '').trim();
        const col4 = String(row.getCell(4).text || row.getCell(4).value || '').trim();

        let level = '';
        let letter = '';
        let year = new Date().getFullYear();

        if (col4) {
          // Formato 4 columnas: Nivel, Enseñanza, Letra, Año
          const nivelNum = col1.replace(/[^0-9]/g, '');
          const ens = col2.toUpperCase().includes('M') ? 'M' : 'B';
          level = `${nivelNum}${ens}`;
          letter = col3.toUpperCase().replace(/[^A-Z]/g, '');
          year = parseInt(col4, 10) || new Date().getFullYear();
        } else {
          // Formato 3 columnas: Nivel (ej. 2M o 4B), Letra, Año
          level = col1.toUpperCase();
          if (!level.endsWith('B') && !level.endsWith('M')) level += 'B';
          letter = col2.toUpperCase().replace(/[^A-Z]/g, '');
          year = parseInt(col3, 10) || new Date().getFullYear();
        }

        if (!level || !letter) continue;

        await prisma.course.upsert({
          where: { level_letter_year: { level, letter, year } },
          update: {},
          create: { level, letter, year }
        });
        results.imported++;
      } catch (err) {
        results.errors.push({ row: rowNumber, error: err.message });
      }
    }

    return res.json(results);
  } catch (error) {
    console.error('[Error importando cursos]:', error);
    return res.status(500).json({ error: 'Error al importar cursos: ' + error.message });
  }
});

// =======================
// USUARIOS
// =======================
router.get('/users', async (req, res, next) => {
  try {
    const role = req.query.role; // Optional filter
    const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
    const where = {};
    if (role) where.role = role;
    if (year) {
      where.OR = [
        { role: { not: 'STUDENT' } },
        { course: { year } }
      ];
    }
    const users = await prisma.user.findMany({
      where: Object.keys(where).length ? where : undefined,
      select: { rut: true, name: true, role: true, courseId: true, mustChangePassword: true, course: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// Exportar Usuarios a Excel
router.get('/users/export.xlsx', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      include: { course: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }]
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Concepción de Chillán';
    const sheet = workbook.addWorksheet('Usuarios');

    sheet.columns = [
      { header: 'RUT', key: 'rut', width: 15 },
      { header: 'Nombre', key: 'name', width: 32 },
      { header: 'Rol', key: 'role', width: 14 },
      { header: 'Curso', key: 'course', width: 14 },
      { header: 'Debe Cambiar Clave', key: 'mustChange', width: 20 },
      { header: 'Fecha Creación', key: 'createdAt', width: 16 }
    ];

    users.forEach(u => {
      sheet.addRow({
        rut: u.rut,
        name: u.name,
        role: u.role,
        course: u.course ? `${u.course.level.replace('B', '° Básico').replace('M', '° Medio')} ${u.course.letter}` : 'Sin curso',
        mustChange: u.mustChangePassword ? 'SÍ' : 'NO',
        createdAt: new Date(u.createdAt).toLocaleDateString('es-CL')
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Usuarios_CCG.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

router.post('/users', checkAdmin, async (req, res, next) => {
  try {
    let { rut, name, role, courseId, password } = req.body;
    rut = normalizeRut(rut);
    
    if (!password) {
      password = rut.split('-')[0].slice(0, 6);
    }
    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        rut,
        name,
        role,
        passwordHash: hash,
        courseId: courseId || null,
        mustChangePassword: true,
      },
      select: { rut: true, name: true, role: true, courseId: true }
    });
    res.json(user);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'El RUT ya existe' });
    next(error);
  }
});

router.put('/users/:rut', checkAdmin, async (req, res, next) => {
  try {
    let targetRut = normalizeRut(req.params.rut);
    const { name, role, courseId, resetPassword } = req.body;
    
    const data = { name, role, courseId: courseId || null };
    
    if (resetPassword) {
      const password = targetRut.split('-')[0].slice(0, 6);
      data.passwordHash = await bcrypt.hash(password, 10);
      data.mustChangePassword = true;
    }

    const user = await prisma.user.update({
      where: { rut: targetRut },
      data,
      select: { rut: true, name: true, role: true, courseId: true }
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.delete('/users/:rut', checkAdmin, async (req, res, next) => {
  try {
    let targetRut = normalizeRut(req.params.rut);
    await prisma.user.delete({ where: { rut: targetRut } });
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    next(error);
  }
});

// Importar Usuarios desde Excel o CSV
router.post('/users/import', checkAdmin, uploadMemory.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo para importar' });

  let worksheet;
  try {
    worksheet = await parseSpreadsheet(req.file.buffer, req.file.originalname);
  } catch (parseErr) {
    console.error('[Error parseando archivo de usuarios]:', parseErr);
    return res.status(400).json({ error: parseErr.message || 'No se pudo leer el archivo Excel o CSV' });
  }

  try {
    const results = { imported: 0, errors: [] };

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const col1 = String(row.getCell(1).text || row.getCell(1).value || '').trim();
        const col2 = String(row.getCell(2).text || row.getCell(2).value || '').trim();
        const col3 = String(row.getCell(3).text || row.getCell(3).value || '').trim();
        const col4 = String(row.getCell(4).text || row.getCell(4).value || '').trim();
        const col5 = String(row.getCell(5).text || row.getCell(5).value || '').trim();
        const col6 = String(row.getCell(6).text || row.getCell(6).value || '').trim();
        const col7 = String(row.getCell(7).text || row.getCell(7).value || '').trim();

        let rut = normalizeRut(col1);
        let name = col2;
        let level = '';
        let letter = '';
        let year = new Date().getFullYear();
        let role = 'STUDENT';

        if (!rut || rut.length < 3 || !name) continue;

        if (col6) {
          // Formato 6 o 7 columnas: RUT, Nombre, Nivel, Enseñanza, Letra, Año, [Rol]
          const nivelNum = col3.replace(/[^0-9]/g, '');
          const ens = col4.toUpperCase().includes('M') ? 'M' : 'B';
          level = `${nivelNum}${ens}`;
          letter = col5.toUpperCase().replace(/[^A-Z]/g, '');
          year = parseInt(col6, 10) || new Date().getFullYear();
          if (col7) role = normalizeRole(col7);
        } else if (col5 && /^\d{4}$/.test(col4)) {
          // Formato 5 columnas: RUT, Nombre, Curso, Año, Rol
          let courseString = col3.toUpperCase();
          year = parseInt(col4, 10) || new Date().getFullYear();
          role = normalizeRole(col5);
          const match = courseString.match(/^(\d+)([BM]?)\s*([A-Z])$/);
          if (match) {
            level = match[1] + (match[2] || "B");
            letter = match[3];
          } else if (courseString.length >= 2) {
            level = courseString.slice(0, -1);
            if (!level.endsWith('B') && !level.endsWith('M')) level += 'B';
            letter = courseString.slice(-1);
          }
        } else {
          // Formato anterior: RUT, Nombre, Curso, Rol
          let courseString = col3.toUpperCase();
          if (col4) role = normalizeRole(col4);
          const match = courseString.match(/^(\d+)([BM]?)\s*([A-Z])$/);
          if (match) {
            level = match[1] + (match[2] || "B");
            letter = match[3];
          } else if (courseString.length >= 2) {
            level = courseString.slice(0, -1);
            if (!level.endsWith('B') && !level.endsWith('M')) level += 'B';
            letter = courseString.slice(-1);
          }
        }

        let courseId = null;
        if (role === 'STUDENT' && level && letter) {
          let course = await prisma.course.upsert({
            where: {
              level_letter_year: { level, letter, year }
            },
            update: {},
            create: { level, letter, year }
          });
          courseId = course.id;
        }

        const rawDigits = rut.replace(/[^0-9]/g, '');
        const password = rawDigits.length >= 4 ? rawDigits.slice(0, 6) : 'simce123';
        const hash = await bcrypt.hash(password, 10);

        await prisma.user.upsert({
          where: { rut },
          update: { name, role, courseId },
          create: { rut, name, role, courseId, passwordHash: hash, mustChangePassword: true }
        });
        results.imported++;
      } catch (err) {
        results.errors.push({ row: rowNumber, error: err.message });
      }
    }

    return res.json(results);
  } catch (error) {
    console.error('[Error interno al procesar usuarios]:', error);
    return res.status(500).json({ error: 'Error interno al procesar usuarios: ' + error.message });
  }
});

// Asignación Masiva de Contraseña por Curso
router.post('/users/bulk-password', checkAdmin, async (req, res, next) => {
  try {
    const { courseId, courseIds, newPassword, mustChangePassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    const ids = courseIds && Array.isArray(courseIds) ? courseIds.map(Number) : (courseId ? [Number(courseId)] : []);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos un curso' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    const updated = await prisma.user.updateMany({
      where: {
        role: 'STUDENT',
        courseId: { in: ids }
      },
      data: {
        passwordHash: hash,
        mustChangePassword: !!mustChangePassword
      }
    });
    res.json({ message: `Contraseña actualizada para ${updated.count} estudiantes`, count: updated.count });
  } catch (error) {
    next(error);
  }
});

// =======================
// EXÁMENES (ENSAYOS)
// =======================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.pdf';
    cb(null, `exam-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`);
  }
});

const uploadDisk = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
  fileFilter: (req, file, cb) => {
    const original = String(file.originalname || '').toLowerCase();
    const isPdfExt = original.endsWith('.pdf');
    const isPdfMime = file.mimetype === 'application/pdf' || 
                      file.mimetype === 'application/x-pdf' || 
                      file.mimetype === 'application/octet-stream';
    if (isPdfExt || isPdfMime) {
      cb(null, true);
    } else {
      const err = new Error('Solo se permiten archivos en formato PDF (.pdf)');
      err.status = 400;
      cb(err);
    }
  }
});

router.get('/exams', async (req, res, next) => {
  try {
    const exams = await prisma.exam.findMany({
      include: { 
        questions: true,
        assignments: {
          include: { course: true }
        }
      },
      orderBy: [
        { orderNumber: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    // Transform to expected frontend shape
    const result = (exams || []).map(e => {
      const answerKey = {};
      const skillsKeys = {};
      const axesKeys = {};
      const learningObjectivesKeys = {};
      const difficultiesKeys = {};

      (e.questions || []).forEach(q => {
        if (!q) return;
        answerKey[q.questionNumber] = q.correctAnswer;
        if (q.skill) skillsKeys[q.questionNumber] = q.skill;
        if (q.axis) axesKeys[q.questionNumber] = q.axis;
        if (q.learningObjective) learningObjectivesKeys[q.questionNumber] = q.learningObjective;
        if (q.difficulty !== null && q.difficulty !== undefined) difficultiesKeys[q.questionNumber] = q.difficulty;
      });

      const assignedCourses = (e.assignments || [])
        .filter(a => a && a.course)
        .map(a => ({
          id: a.course.id,
          level: a.course.level || '',
          letter: a.course.letter || '',
          year: a.course.year || new Date().getFullYear(),
          name: `${(a.course.level || '').replace('B', '° Básico').replace('M', '° Medio')} ${a.course.letter || ''} (${a.course.year || ''})`.trim()
        }));

      return {
        id: e.id,
        title: e.title || 'Ensayo',
        subject: e.subject || 'General',
        level: e.level || '', 
        orderNumber: e.orderNumber ?? 1, 
        examType: e.examType || 'ENSAYO',
        durationMinutes: e.durationMinutes,
        optionsCount: e.optionsCount || 4,
        questionCount: (e.questions || []).length,
        createdAt: e.createdAt,
        assignedCourses,
        answerKey,
        skillsKeys,
        axesKeys,
        learningObjectivesKeys,
        difficultiesKeys
      };
    });

    return res.json(result);
  } catch (error) {
    console.error('[Error al obtener catálogo de ensayos]:', error);
    return res.status(500).json({ error: 'Error al obtener ensayos: ' + error.message });
  }
});

// Exportar Catálogo de Ensayos a Excel
router.get('/exams/export.xlsx', async (req, res, next) => {
  try {
    const exams = await prisma.exam.findMany({
      include: { _count: { select: { questions: true, assignments: true } } },
      orderBy: { createdAt: 'desc' }
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Concepción de Chillán';
    const sheet = workbook.addWorksheet('Catálogo de Ensayos');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Título', key: 'title', width: 35 },
      { header: 'Asignatura', key: 'subject', width: 20 },
      { header: 'Nivel', key: 'level', width: 14 },
      { header: 'Tipo de Ensayo', key: 'type', width: 16 },
      { header: 'Preguntas', key: 'qCount', width: 12 },
      { header: 'Asignaciones Cursos', key: 'aCount', width: 20 },
      { header: 'Fecha Creación', key: 'createdAt', width: 16 }
    ];

    exams.forEach(e => {
      sheet.addRow({
        id: e.id,
        title: e.title,
        subject: e.subject,
        level: e.level,
        type: e.examType,
        qCount: e._count.questions,
        aCount: e._count.assignments,
        createdAt: new Date(e.createdAt).toLocaleDateString('es-CL')
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Catalogo_Ensayos_SIMCE.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

router.get('/exams/:id', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const e = await prisma.exam.findUnique({
      where: { id },
      include: { questions: true }
    });
    if (!e) return res.status(404).json({ error: 'Ensayo no encontrado' });
    
    const answerKey = {};
    const skillsKeys = {};
    const axesKeys = {};
    const learningObjectivesKeys = {};
    const difficultiesKeys = {};
    e.questions.forEach(q => {
      answerKey[q.questionNumber] = q.correctAnswer;
      if (q.skill) skillsKeys[q.questionNumber] = q.skill;
      if (q.axis) axesKeys[q.questionNumber] = q.axis;
      if (q.learningObjective) learningObjectivesKeys[q.questionNumber] = q.learningObjective;
      if (q.difficulty !== null && q.difficulty !== undefined) difficultiesKeys[q.questionNumber] = q.difficulty;
    });
    res.json({
      id: e.id,
      title: e.title,
      subject: e.subject,
      level: e.level, orderNumber: e.orderNumber, examType: e.examType,
      optionsCount: e.optionsCount,
      questionCount: e.questions.length,
      answerKey,
      skillsKeys,
      axesKeys,
      learningObjectivesKeys,
      difficultiesKeys
    });
  } catch (error) {
    next(error);
  }
});

router.post('/exams', checkAdmin, (req, res, next) => {
  uploadDisk.single('pdf')(req, res, (err) => {
    if (err) {
      console.error('[Error de Multer al subir PDF]:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido de 30 MB' });
      }
      return res.status(400).json({ error: err.message || 'Error al procesar el archivo PDF' });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const { title, subject, level, questionCount, optionsCount, orderNumber, examType } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'Debes seleccionar y subir un archivo PDF para el ensayo' });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'El título del ensayo es obligatorio' });
    }
    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ error: 'Debes seleccionar la asignatura del ensayo' });
    }

    const qCount = parseInt(questionCount, 10) || 30;
    const optCount = parseInt(optionsCount, 10) || 4;
    const ordNum = parseInt(orderNumber, 10) || 1;
    const eType = examType || 'ENSAYO';
    const lvl = level || '4B';

    const questions = [];
    for (let i = 1; i <= qCount; i++) {
      questions.push({
        questionNumber: i,
        correctAnswer: 'A', // default placeholder
      });
    }

    const exam = await prisma.exam.create({
      data: {
        title: String(title).trim(),
        subject: String(subject).trim(),
        level: lvl,
        optionsCount: optCount,
        orderNumber: ordNum,
        examType: eType,
        pdfPath: req.file.filename,
        questions: {
          create: questions
        }
      }
    });

    return res.json(exam);
  } catch (error) {
    console.error('[Error al crear ensayo en DB]:', error);
    return res.status(500).json({ error: 'Error al registrar el ensayo en la base de datos: ' + error.message });
  }
});

router.put('/exams/:id', checkAdmin, async (req, res, next) => {
  try {
    const { title, subject, level, optionsCount } = req.body;
    const exam = await prisma.exam.update({
      where: { id: parseInt(req.params.id, 10) },
      data: { 
        title, 
        subject,
        level,
        optionsCount: parseInt(optionsCount, 10) 
      }
    });
    res.json(exam);
  } catch (error) {
    next(error);
  }
});

router.delete('/exams/:id', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const exam = await prisma.exam.findUnique({ where: { id } });
    if (exam && exam.pdfPath) {
      const fullPath = path.join(__dirname, '../../uploads', exam.pdfPath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await prisma.exam.delete({ where: { id } });
    res.json({ message: 'Ensayo eliminado' });
  } catch (error) {
    next(error);
  }
});

router.put('/exams/:id/answer-key', checkAdmin, async (req, res, next) => {
  try {
    const examId = parseInt(req.params.id, 10);
    const { answerKey, skillsKeys, axesKeys, learningObjectivesKeys, difficultiesKeys } = req.body; 
    
    // For each question, update or create
    for (const [qNumStr, ans] of Object.entries(answerKey)) {
      const qNum = parseInt(qNumStr, 10);
      const skill = skillsKeys ? skillsKeys[qNumStr] || null : null;
      const axis = axesKeys ? axesKeys[qNumStr] || null : null;
      const learningObjective = learningObjectivesKeys ? learningObjectivesKeys[qNumStr] || null : null;
      const difficulty = difficultiesKeys && difficultiesKeys[qNumStr] !== undefined && difficultiesKeys[qNumStr] !== ""
        ? parseFloat(difficultiesKeys[qNumStr])
        : 0.0;
      
      await prisma.question.upsert({
        where: { examId_questionNumber: { examId, questionNumber: qNum } },
        update: { correctAnswer: ans, skill, axis, learningObjective, difficulty },
        create: { examId, questionNumber: qNum, correctAnswer: ans, skill, axis, learningObjective, difficulty }
      });
    }

    res.json({ message: 'Pauta actualizada' });
  } catch (error) {
    next(error);
  }
});

// Importar Pauta de Ensayo desde Excel o CSV
router.post('/exams/:id/import-questions', checkAdmin, uploadMemory.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo para importar' });

  let worksheet;
  try {
    worksheet = await parseSpreadsheet(req.file.buffer, req.file.originalname);
  } catch (parseErr) {
    return res.status(400).json({ error: parseErr.message || 'No se pudo leer el archivo Excel o CSV' });
  }

  try {
    const examId = parseInt(req.params.id, 10);
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Ensayo no encontrado' });

    const results = { imported: 0, errors: [] };

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        let qNumStr = String(row.getCell(1).text || row.getCell(1).value || '').trim();
        let qNum = parseInt(qNumStr, 10);
        let ans = String(row.getCell(2).text || row.getCell(2).value || '').trim().toUpperCase();
        let skill = String(row.getCell(3).text || row.getCell(3).value || '').trim() || null;
        let axis = String(row.getCell(4).text || row.getCell(4).value || '').trim() || null;
        let oa = String(row.getCell(5).text || row.getCell(5).value || '').trim() || null;
        let diffStr = String(row.getCell(6).text || row.getCell(6).value || '').trim();
        let difficulty = diffStr !== '' ? parseFloat(diffStr) : 0.0;
        if (isNaN(difficulty)) difficulty = 0.0;

        if (isNaN(qNum) || !ans) continue;

        await prisma.question.upsert({
          where: { examId_questionNumber: { examId, questionNumber: qNum } },
          update: { correctAnswer: ans, skill, axis, learningObjective: oa, difficulty },
          create: { examId, questionNumber: qNum, correctAnswer: ans, skill, axis, learningObjective: oa, difficulty }
        });
        results.imported++;
      } catch (err) {
        results.errors.push({ row: rowNumber, error: err.message });
      }
    }

    return res.json(results);
  } catch (error) {
    console.error('[Error importando pauta]:', error);
    return res.status(500).json({ error: 'Error al importar pauta: ' + error.message });
  }
});

// =======================
// ASIGNACIONES
// =======================
router.get('/assignments', async (req, res, next) => {
  try {
    const yearFilter = req.query.year ? parseInt(req.query.year, 10) : undefined;
    const assignments = await prisma.examAssignment.findMany({
      where: yearFilter ? { course: { year: yearFilter } } : undefined,
      include: {
        exam: true,
        course: true,
        assignedTeacher: { select: { name: true, rut: true } }
      },
      orderBy: { opensAt: 'desc' }
    });
    const result = (assignments || []).map(a => ({
      id: a.id,
      examId: a.examId,
      courseId: a.courseId,
      opensAt: a.opensAt,
      closesAt: a.closesAt,
      durationMinutes: a.exam?.durationMinutes || 90,
      dynamicPassword: a.dynamicPassword,
      dynamicPasswordActive: Boolean(a.dynamicPasswordActive),
      status: a.status,
      originalOpensAt: a.originalOpensAt,
      cancelReason: a.cancelReason,
      Exam: a.exam,
      Course: a.course,
      assignedTeacher: a.assignedTeacher
    }));
    return res.json(result);
  } catch (error) {
    console.error('[Error al obtener asignaciones]:', error);
    return res.status(500).json({ error: 'Error al obtener asignaciones: ' + error.message });
  }
});

router.patch('/assignments/:id/dynamic-password', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { dynamicPassword, dynamicPasswordActive } = req.body;
    const assignment = await prisma.examAssignment.update({
      where: { id },
      data: {
        dynamicPassword: dynamicPassword ? dynamicPassword.trim().toUpperCase() : null,
        dynamicPasswordActive: Boolean(dynamicPasswordActive)
      }
    });
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

// Exportar Asignaciones a Excel
router.get('/assignments/export.xlsx', async (req, res, next) => {
  try {
    const assignments = await prisma.examAssignment.findMany({
      include: {
        exam: true,
        course: { include: { _count: { select: { students: true } } } },
        assignedTeacher: { select: { name: true, rut: true } },
        _count: { select: { submissions: true } }
      },
      orderBy: { opensAt: 'desc' }
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Colegio Concepción de Chillán';
    const sheet = workbook.addWorksheet('Asignaciones');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Ensayo', key: 'exam', width: 35 },
      { header: 'Asignatura', key: 'subject', width: 20 },
      { header: 'Curso', key: 'course', width: 14 },
      { header: 'Docente Responsable', key: 'teacher', width: 28 },
      { header: 'Fecha Apertura', key: 'opensAt', width: 16 },
      { header: 'Fecha Cierre', key: 'closesAt', width: 16 },
      { header: 'Entregas', key: 'submissions', width: 12 },
      { header: 'Matrícula', key: 'students', width: 12 },
      { header: 'Resultados Liberados', key: 'released', width: 20 }
    ];

    assignments.forEach(a => {
      sheet.addRow({
        id: a.id,
        exam: a.exam.title,
        subject: a.exam.subject,
        course: a.course ? `${a.course.level.replace('B', '° Básico').replace('M', '° Medio')} ${a.course.letter}` : 'Sin curso',
        teacher: a.assignedTeacher ? `${a.assignedTeacher.name} (${a.assignedTeacher.rut})` : 'Sin asignar',
        opensAt: new Date(a.opensAt).toLocaleString('es-CL'),
        closesAt: new Date(a.closesAt).toLocaleString('es-CL'),
        submissions: a._count.submissions,
        students: a.course?._count?.students || 0,
        released: a.released ? 'SÍ' : 'NO'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Asignaciones_CCG.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

router.post('/assignments', checkAdmin, async (req, res, next) => {
  try {
    const { examId, courseId, opensAt, closesAt, assignedTeacherRut, durationMinutes, dynamicPassword, dynamicPasswordActive } = req.body;
    
    if (durationMinutes !== undefined && durationMinutes !== null) {
      const dur = parseInt(durationMinutes, 10);
      await prisma.exam.update({
        where: { id: parseInt(examId, 10) },
        data: { durationMinutes: !isNaN(dur) && dur > 0 ? dur : null }
      });
    }

    const assignment = await prisma.examAssignment.create({
      data: {
        examId: parseInt(examId, 10),
        courseId: parseInt(courseId, 10),
        opensAt: new Date(opensAt),
        closesAt: new Date(closesAt),
        assignedTeacherRut: assignedTeacherRut || null,
        dynamicPassword: dynamicPassword ? String(dynamicPassword).trim().toUpperCase() : null,
        dynamicPasswordActive: Boolean(dynamicPasswordActive),
      },
      include: {
        exam: true,
        course: true,
        assignedTeacher: { select: { name: true, rut: true } }
      }
    });
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

router.patch('/assignments/:id/teacher', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { assignedTeacherRut } = req.body;
    
    const assignment = await prisma.examAssignment.update({
      where: { id },
      data: { assignedTeacherRut: assignedTeacherRut || null },
      include: { assignedTeacher: true }
    });
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

router.put('/assignments/:id', checkAdmin, async (req, res, next) => {
  try {
    const { opensAt, closesAt } = req.body;
    const assignment = await prisma.examAssignment.update({
      where: { id: parseInt(req.params.id, 10) },
      data: {
        opensAt: new Date(opensAt),
        closesAt: new Date(closesAt),
      },
      include: {
        exam: true,
        course: true, assignedTeacher: { select: { name: true, rut: true } }
      }
    });
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

router.delete('/assignments/:id', checkAdmin, async (req, res, next) => {
  try {
    await prisma.examAssignment.delete({ where: { id: parseInt(req.params.id, 10) } });
    res.json({ message: 'Asignación eliminada' });
  } catch (error) {
    next(error);
  }
});

router.patch('/assignments/:id/reschedule', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { opensAt, closesAt, reason } = req.body;
    const current = await prisma.examAssignment.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Asignación no encontrada' });

    const originalOpensAt = current.originalOpensAt || current.opensAt;
    const assignment = await prisma.examAssignment.update({
      where: { id },
      data: {
        opensAt: new Date(opensAt),
        closesAt: new Date(closesAt),
        status: 'RESCHEDULED',
        originalOpensAt,
        cancelReason: reason || null
      },
      include: {
        exam: true,
        course: true,
        assignedTeacher: { select: { name: true, rut: true } }
      }
    });
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

router.patch('/assignments/:id/cancel', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;
    const assignment = await prisma.examAssignment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelReason: reason || 'Cancelado por administración'
      },
      include: {
        exam: true,
        course: true,
        assignedTeacher: { select: { name: true, rut: true } }
      }
    });
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

// =======================
// HITOS OFICIALES SIMCE
// =======================
router.get('/milestones', async (req, res, next) => {
  try {
    const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
    const milestones = await prisma.simceMilestone.findMany({
      where: year ? { year } : undefined,
      include: { course: true },
      orderBy: { date: 'asc' }
    });
    res.json(milestones);
  } catch (error) {
    next(error);
  }
});

router.post('/milestones', checkAdmin, async (req, res, next) => {
  try {
    const { title, description, notes, date, level, year, courseId } = req.body;
    const milestone = await prisma.simceMilestone.create({
      data: {
        title,
        notes: notes || description || null,
        date: new Date(date),
        level: level || '4B',
        year: parseInt(year, 10) || new Date().getFullYear(),
        courseId: courseId ? parseInt(courseId, 10) : null
      },
      include: { course: true }
    });
    res.json(milestone);
  } catch (error) {
    next(error);
  }
});

router.put('/milestones/:id', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { title, description, notes, date, level, year, courseId } = req.body;
    const milestone = await prisma.simceMilestone.update({
      where: { id },
      data: {
        title,
        notes: notes || description || null,
        date: date ? new Date(date) : undefined,
        level,
        year: year ? parseInt(year, 10) : undefined,
        courseId: courseId ? parseInt(courseId, 10) : null
      },
      include: { course: true }
    });
    res.json(milestone);
  } catch (error) {
    next(error);
  }
});

router.delete('/milestones/:id', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.simceMilestone.delete({ where: { id } });
    res.json({ message: 'Hito SIMCE eliminado' });
  } catch (error) {
    next(error);
  }
});

// Importar Asignaciones desde Excel o CSV
router.post('/assignments/import', checkAdmin, uploadMemory.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo para importar' });

  let worksheet;
  try {
    worksheet = await parseSpreadsheet(req.file.buffer, req.file.originalname);
  } catch (parseErr) {
    return res.status(400).json({ error: parseErr.message || 'No se pudo leer el archivo Excel o CSV' });
  }

  try {
    const results = { imported: 0, errors: [] };

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        let examIdStr = String(row.getCell(1).text || row.getCell(1).value || '').trim();
        let examId = parseInt(examIdStr, 10);
        let level = String(row.getCell(2).text || row.getCell(2).value || '').trim().toUpperCase();
        let letter = String(row.getCell(3).text || row.getCell(3).value || '').trim().toUpperCase();
        let teacherRut = String(row.getCell(4).text || row.getCell(4).value || '').trim();
        let opensAtStr = String(row.getCell(5).text || row.getCell(5).value || '').trim();
        let closesAtStr = String(row.getCell(6).text || row.getCell(6).value || '').trim();

        if (!level || !letter) continue;
        if (!level.endsWith('B') && !level.endsWith('M')) level += 'B';

        // Resolve Exam
        let exam = null;
        if (!isNaN(examId)) {
          exam = await prisma.exam.findUnique({ where: { id: examId } });
        }
        if (!exam && examIdStr) {
          exam = await prisma.exam.findFirst({ where: { title: examIdStr } });
        }
        if (!exam) {
          results.errors.push({ row: rowNumber, error: `Ensayo '${examIdStr}' no encontrado` });
          continue;
        }

        // Resolve Course
        const currentYear = new Date().getFullYear();
        let course = await prisma.course.findFirst({
          where: { level, letter, year: currentYear }
        });
        if (!course) {
          course = await prisma.course.findFirst({
            where: { level, letter },
            orderBy: { year: 'desc' }
          });
        }
        if (!course) {
          results.errors.push({ row: rowNumber, error: `Curso ${level} ${letter} no encontrado` });
          continue;
        }

        // Resolve Teacher (optional)
        let assignedTeacherRut = null;
        if (teacherRut) {
          teacherRut = normalizeRut(teacherRut);
          const teacher = await prisma.user.findUnique({ where: { rut: teacherRut } });
          if (teacher) {
            assignedTeacherRut = teacher.rut;
          }
        }

        const opensAt = opensAtStr ? new Date(opensAtStr) : new Date();
        const closesAt = closesAtStr ? new Date(closesAtStr) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await prisma.examAssignment.upsert({
          where: {
            examId_courseId: { examId: exam.id, courseId: course.id }
          },
          update: {
            opensAt: isNaN(opensAt.getTime()) ? new Date() : opensAt,
            closesAt: isNaN(closesAt.getTime()) ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : closesAt,
            assignedTeacherRut
          },
          create: {
            examId: exam.id,
            courseId: course.id,
            opensAt: isNaN(opensAt.getTime()) ? new Date() : opensAt,
            closesAt: isNaN(closesAt.getTime()) ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : closesAt,
            assignedTeacherRut
          }
        });
        results.imported++;
      } catch (err) {
        results.errors.push({ row: rowNumber, error: err.message });
      }
    }

    return res.json(results);
  } catch (error) {
    console.error('[Error importando asignaciones]:', error);
    return res.status(500).json({ error: 'Error al importar asignaciones: ' + error.message });
  }
});

// ==========================================
// FLUJO HÍBRIDO DE REMEDIALES: UTP Y ADMINISTRACIÓN
// ==========================================

// 1. Listar propuestas de remediales enviadas por los profesores
router.get('/remedial-proposals', checkAdmin, async (req, res, next) => {
  try {
    const { status, year } = req.query;
    const yearFilter = year ? parseInt(year, 10) : undefined;

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (yearFilter) {
      where.course = { year: yearFilter };
    }

    const proposals = await prisma.remedialProposal.findMany({
      where,
      include: {
        originAssignment: {
          include: {
            exam: true,
            course: true
          }
        },
        remedialExam: true,
        teacher: { select: { name: true, rut: true } },
        course: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(proposals);
  } catch (error) {
    next(error);
  }
});

// 2. Aprobar propuesta remedial y agendar formalmente la prueba en el curso
router.patch('/remedial-proposals/:id/approve', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const proposal = await prisma.remedialProposal.findUnique({
      where: { id },
      include: {
        originAssignment: { include: { exam: true } },
        course: true
      }
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Propuesta remedial no encontrada' });
    }

    const { opensAt, closesAt, remedialExamId, reviewNotes } = req.body;

    // Resolver examen remedial: el indicado o el que venía sugerido
    let targetExamId = remedialExamId ? parseInt(remedialExamId, 10) : proposal.remedialExamId;
    if (!targetExamId) {
      // Buscar un examen compatible tipo REMEDIAL o QUIZ para ese nivel y asignatura
      const fallbackExam = await prisma.exam.findFirst({
        where: {
          level: proposal.course.level,
          subject: proposal.originAssignment.exam.subject,
          examType: { in: ['REMEDIAL', 'QUIZ'] }
        }
      });
      if (fallbackExam) targetExamId = fallbackExam.id;
      else {
        return res.status(400).json({ error: 'Debes seleccionar un examen de tipo REMEDIAL o QUIZ para agendar esta acción.' });
      }
    }

    // Calcular fechas
    const suggestedDateStr = new Date(proposal.suggestedDate).toISOString().split('T')[0];
    const finalOpensAt = opensAt ? new Date(opensAt) : new Date(`${suggestedDateStr}T${proposal.startTime || '08:30'}:00`);
    const finalClosesAt = closesAt ? new Date(closesAt) : new Date(`${suggestedDateStr}T${proposal.endTime || '10:00'}:00`);

    // Crear la asignación formal
    const newAssignment = await prisma.examAssignment.create({
      data: {
        examId: targetExamId,
        courseId: proposal.courseId,
        opensAt: finalOpensAt,
        closesAt: finalClosesAt,
        assignedTeacherRut: proposal.teacherRut,
        remedialOriginId: proposal.originAssignmentId,
        status: 'SCHEDULED'
      },
      include: {
        exam: true,
        course: true,
        assignedTeacher: { select: { name: true, rut: true } }
      }
    });

    // Actualizar la propuesta
    const updatedProposal = await prisma.remedialProposal.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedByRut: req.user.rut,
        reviewNotes: reviewNotes || 'Aprobado por UTP',
        createdAssignmentId: newAssignment.id,
        remedialExamId: targetExamId
      },
      include: {
        remedialExam: true,
        teacher: true,
        course: true
      }
    });

    res.json({
      message: 'Propuesta remedial aprobada con éxito. Asignación programada en el curso.',
      proposal: updatedProposal,
      createdAssignment: newAssignment
    });
  } catch (error) {
    next(error);
  }
});

// 3. Rechazar propuesta remedial
router.patch('/remedial-proposals/:id/reject', checkAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    const updated = await prisma.remedialProposal.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedByRut: req.user.rut,
        reviewNotes: reason || 'Rechazada por UTP'
      }
    });

    res.json({ message: 'Propuesta rechazada', proposal: updated });
  } catch (error) {
    next(error);
  }
});

// 4. Alerta de Ensayos sin Acción Remedial Programada
router.get('/remedial-alerts', checkAdmin, async (req, res, next) => {
  try {
    const { year } = req.query;
    const yearFilter = year ? parseInt(year, 10) : undefined;

    // Ensayos rendidos de tipo ENSAYO
    const assignments = await prisma.examAssignment.findMany({
      where: {
        exam: { examType: 'ENSAYO' },
        course: yearFilter ? { year: yearFilter } : undefined,
        submissions: { some: { status: 'SUBMITTED' } } // ya tiene respuestas
      },
      include: {
        exam: true,
        course: true,
        assignedTeacher: { select: { name: true, rut: true } },
        remedialProposals: {
          include: { remedialExam: true }
        },
        _count: {
          select: { submissions: true }
        }
      },
      orderBy: { opensAt: 'desc' }
    });

    // Filtrar aquellas que NO tienen ni propuesta PENDING ni APPROVED ni remedial creada
    const alerts = [];
    for (const a of assignments) {
      if (!a || !a.exam || !a.course) continue;
      const hasApprovedOrPending = (a.remedialProposals || []).some(p => p.status === 'PENDING' || p.status === 'APPROVED');
      const hasDirectFollowUp = await prisma.examAssignment.findFirst({
        where: { remedialOriginId: a.id }
      });

      if (!hasApprovedOrPending && !hasDirectFollowUp) {
        const cLevel = (a.course.level || '').replace('B', '° Básico').replace('M', '° Medio');
        const cLetter = a.course.letter || '';
        const courseName = `${cLevel} ${cLetter}`.trim();
        alerts.push({
          assignmentId: a.id,
          examId: a.exam.id,
          examTitle: a.exam.title || 'Ensayo',
          subject: a.exam.subject || 'General',
          level: a.exam.level || '',
          courseId: a.course.id,
          courseName,
          year: a.course.year || new Date().getFullYear(),
          submissionsCount: a._count?.submissions || 0,
          teacherName: a.assignedTeacher?.name || 'Sin docente asignado',
          teacherRut: a.assignedTeacherRut,
          opensAt: a.opensAt,
          alertMessage: `El ensayo "${a.exam.title}" de ${courseName} ya fue rendido pero NO cuenta con plan remedial programado ni propuesto.`
        });
      }
    }

    res.json({
      totalAlerts: alerts.length,
      alerts
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
