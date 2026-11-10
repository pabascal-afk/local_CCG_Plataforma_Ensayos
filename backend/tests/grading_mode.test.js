require('dotenv').config();
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const exceljs = require('exceljs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const {
  chileanGrade,
  computeResults,
  normalizeGradingMode,
  normalizePassThreshold,
} = require('../src/services/grading');

describe('Selector de modalidad de calificación (SIMCE TRI vs Prueba normal editable)', () => {
  const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'));
  const adminToken = signToken({ rut: '11111111-1', role: 'ADMIN', name: 'Admin Grading Test' });
  const teacherRut = '17776665-4';
  const studentRut = '18889990-2';
  const inProgressStudentRut = '18889991-0';
  const studentToken = signToken({ rut: studentRut, role: 'STUDENT', name: 'Estudiante Modo Prueba' });

  const uploadedPdfPaths = [];
  let course;
  let normalExamId;
  let simceExamId;
  let weightedExamId;
  let normalAssignment;
  let weightedAssignment;
  let inProgressSub;

  beforeAll(async () => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    // Limpiar posibles restos de ejecuciones previas fallidas
    await prisma.exam.deleteMany({
      where: {
        title: {
          in: [
            'Prueba Normal Geometría 70%',
            'Ensayo SIMCE Default 60%',
            'Prueba Normal Puntaje por Pregunta',
          ],
        },
      },
    });
    const hash = await bcrypt.hash('test1234', 10);

    course = await prisma.course.upsert({
      where: { level_letter_year: { level: '5B', letter: 'G', year: 2097 } },
      update: {},
      create: { level: '5B', letter: 'G', year: 2097 },
    });

    await prisma.user.upsert({
      where: { rut: teacherRut },
      update: { role: 'TEACHER', isActive: true },
      create: {
        rut: teacherRut,
        name: 'Docente Modo Calificación',
        role: 'TEACHER',
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true,
      },
    });

    await prisma.user.upsert({
      where: { rut: studentRut },
      update: { courseId: course.id, role: 'STUDENT', isActive: true },
      create: {
        rut: studentRut,
        name: 'Estudiante Normal 1',
        role: 'STUDENT',
        courseId: course.id,
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true,
      },
    });

    await prisma.user.upsert({
      where: { rut: inProgressStudentRut },
      update: { courseId: course.id, role: 'STUDENT', isActive: true },
      create: {
        rut: inProgressStudentRut,
        name: 'Estudiante En Curso',
        role: 'STUDENT',
        courseId: course.id,
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    for (const aid of [normalAssignment?.id, weightedAssignment?.id].filter(Boolean)) {
      await prisma.examAssignment.delete({ where: { id: aid } }).catch(() => {});
    }
    for (const eid of [normalExamId, simceExamId, weightedExamId].filter(Boolean)) {
      await prisma.exam.delete({ where: { id: eid } }).catch(() => {});
    }
    for (const r of [studentRut, inProgressStudentRut, teacherRut]) {
      await prisma.user.delete({ where: { rut: r } }).catch(() => {});
    }
    if (course?.id) {
      await prisma.course.delete({ where: { id: course.id } }).catch(() => {});
    }
    for (const p of uploadedPdfPaths) {
      const fullPath = path.join(uploadsDir, path.basename(p));
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch {}
      }
    }
    await prisma.$disconnect();
  });

  describe('Pruebas unitarias de motor de calificación (grading.js)', () => {
    const sampleQuestions = [
      { id: 1, questionNumber: 1, questionType: 'MULTIPLE_CHOICE', correctAnswer: 'A', maxPoints: 1, skill: 'Analizar', axis: 'Números', difficulty: 0.0, guessing: 0.25 },
      { id: 2, questionNumber: 2, questionType: 'MULTIPLE_CHOICE', correctAnswer: 'B', maxPoints: 1, skill: 'Analizar', axis: 'Números', difficulty: 0.0, guessing: 0.25 },
      { id: 3, questionNumber: 3, questionType: 'MULTIPLE_CHOICE', correctAnswer: 'C', maxPoints: 1, skill: 'Resolver', axis: 'Geometría', difficulty: 0.0, guessing: 0.25 },
      { id: 4, questionNumber: 4, questionType: 'MULTIPLE_CHOICE', correctAnswer: 'D', maxPoints: 1, skill: 'Resolver', axis: 'Geometría', difficulty: 0.0, guessing: 0.25 },
      { id: 5, questionNumber: 5, questionType: 'MULTIPLE_CHOICE', correctAnswer: 'A', maxPoints: 1, skill: 'Modelar', axis: 'Datos', difficulty: 0.0, guessing: 0.25 },
    ];

    test('normalización segura de gradingMode y passThreshold', () => {
      expect(normalizeGradingMode(undefined)).toBe('SIMCE');
      expect(normalizeGradingMode('simce')).toBe('SIMCE');
      expect(normalizeGradingMode('NORMAL')).toBe('NORMAL');
      expect(normalizeGradingMode('normal')).toBe('NORMAL');
      expect(normalizeGradingMode('OTRO')).toBe('SIMCE');

      expect(normalizePassThreshold(undefined)).toBe(0.6);
      expect(normalizePassThreshold(60)).toBe(0.6);
      expect(normalizePassThreshold('70%')).toBe(0.7);
      expect(normalizePassThreshold('0.5')).toBe(0.5);
      expect(normalizePassThreshold(0)).toBe(0.6);
      expect(normalizePassThreshold(120)).toBe(0.6);
    });

    test('exactitud punto flotante en chileanGrade (3/5 al 60% es exactamente 4.0)', () => {
      expect(chileanGrade(3 / 5, 0.6)).toBe(4.0);
      expect(chileanGrade(0.599, 0.6)).toBe(3.9);
      expect(chileanGrade(2 / 5, 0.5)).toBe(3.4);
      expect(chileanGrade(3 / 5, 0.5)).toBe(4.6);
    });

    test('modo NORMAL calcula nota según exigencia editable, nivel por nota y retorna simceScore/theta/seTheta en null', () => {
      // 3 de 5 buenas => 60%
      const answers3of5 = { 1: 'A', 2: 'B', 3: 'C', 4: 'A', 5: 'B' };

      // Con 60% exigencia => 4.0 (ELEMENTAL)
      const res60 = computeResults(sampleQuestions, answers3of5, { gradingMode: 'NORMAL', passThreshold: 0.6 });
      expect(res60.gradingMode).toBe('NORMAL');
      expect(res60.passThreshold).toBe(0.6);
      expect(res60.grade).toBe(4.0);
      expect(res60.achievementLevel).toBe('ELEMENTAL');
      expect(res60.simceScore).toBeNull();
      expect(res60.theta).toBeNull();
      expect(res60.seTheta).toBeNull();

      // Con 70% exigencia => < 4.0 (INSUFICIENTE)
      const res70 = computeResults(sampleQuestions, answers3of5, { gradingMode: 'NORMAL', passThreshold: 0.7 });
      expect(res70.grade).toBe(3.6);
      expect(res70.achievementLevel).toBe('INSUFICIENTE');
      expect(res70.simceScore).toBeNull();

      // Con 50% exigencia y 5/5 => 7.0 (ADECUADO)
      const resFull = computeResults(
        sampleQuestions,
        { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A' },
        { gradingMode: 'NORMAL', passThreshold: 0.5 }
      );
      expect(resFull.grade).toBe(7.0);
      expect(resFull.achievementLevel).toBe('ADECUADO');
      expect(resFull.simceScore).toBeNull();
    });

    test('preguntas abiertas (WRITTEN) usan passThreshold editable para marcar isCorrect', () => {
      const mixed = [
        { id: 10, questionNumber: 1, questionType: 'WRITTEN', correctAnswer: 'DESARROLLO', maxPoints: 10, skill: 'Redactar', axis: 'Escritura' },
      ];
      // 6 de 10 puntos => correcto al 60%, insuficiente al 70%
      const r60 = computeResults(mixed, { 10: 'Texto' }, { gradingMode: 'NORMAL', passThreshold: 0.6 }, { 10: 6 });
      expect(r60.perQuestion[0].isCorrect).toBe(true);
      expect(r60.grade).toBe(4.0);

      const r70 = computeResults(mixed, { 10: 'Texto' }, { gradingMode: 'NORMAL', passThreshold: 0.7 }, { 10: 6 });
      expect(r70.perQuestion[0].isCorrect).toBe(false);
      expect(r70.grade).toBeLessThan(4.0);
    });

    test('modo SIMCE conserva escala TRI (100-400) pero calcula nota chilena según passThreshold editable', () => {
      const answers3of5 = { 1: 'A', 2: 'B', 3: 'C', 4: 'A', 5: 'B' };
      const simce70 = computeResults(sampleQuestions, answers3of5, { gradingMode: 'SIMCE', passThreshold: 0.7 });
      expect(simce70.gradingMode).toBe('SIMCE');
      expect(simce70.simceScore).toBeGreaterThanOrEqual(100);
      expect(simce70.simceScore).toBeLessThanOrEqual(400);
      expect(simce70.theta).not.toBeNull();
      expect(simce70.grade).toBe(3.6);
    });
  });

  describe('Flujo API E2E (Admin, Mocktest, Estudiante, Recálculo, Docente y Dashboard)', () => {
    const dummyPdf = Buffer.from('%PDF-1.4\n%Grading mode integration test\n%%EOF\n');

    test('1. Validación estricta en POST /admin/exams y creación con modo NORMAL + exigencia 70%', async () => {
      const badModeRes = await request(app)
        .post('/api/admin/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Prueba Inválida Modo')
        .field('subject', 'Matemática')
        .field('level', '5B')
        .field('questionCount', '5')
        .field('gradingMode', 'INVALIDO')
        .attach('pdf', dummyPdf, 'bad-mode.pdf');
      expect(badModeRes.status).toBe(400);

      const badThresholdRes = await request(app)
        .post('/api/admin/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Prueba Inválida Exigencia')
        .field('subject', 'Matemática')
        .field('level', '5B')
        .field('questionCount', '5')
        .field('gradingMode', 'NORMAL')
        .field('passThresholdPercent', '100')
        .attach('pdf', dummyPdf, 'bad-pct.pdf');
      expect(badThresholdRes.status).toBe(400);

      // Creación exitosa Prueba Normal con 70% exigencia
      const createRes = await request(app)
        .post('/api/admin/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Prueba Normal Geometría 70%')
        .field('subject', 'Matemática')
        .field('level', '5B')
        .field('questionCount', '5')
        .field('optionsCount', '4')
        .field('orderNumber', '95')
        .field('examType', 'ENSAYO')
        .field('gradingMode', 'NORMAL')
        .field('passThresholdPercent', '70')
        .attach('pdf', dummyPdf, 'normal-geom.pdf');

      normalExamId = createRes.body?.id;
      if (createRes.body?.pdfPath) uploadedPdfPaths.push(createRes.body.pdfPath);

      expect(createRes.status).toBe(200);
      expect(createRes.body.gradingMode).toBe('NORMAL');
      expect(createRes.body.passThreshold).toBe(0.7);
      expect(createRes.body.passThresholdPercent).toBe(70);

      // Creación exitosa Ensayo SIMCE por defecto con exigencia 60%
      const createSimceRes = await request(app)
        .post('/api/admin/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Ensayo SIMCE Default 60%')
        .field('subject', 'Matemática')
        .field('level', '5B')
        .field('questionCount', '5')
        .field('optionsCount', '4')
        .field('orderNumber', '96')
        .attach('pdf', dummyPdf, 'simce-default.pdf');
      simceExamId = createSimceRes.body?.id;
      if (createSimceRes.body?.pdfPath) uploadedPdfPaths.push(createSimceRes.body.pdfPath);
      expect(createSimceRes.status).toBe(200);
      expect(createSimceRes.body.gradingMode).toBe('SIMCE');
      expect(createSimceRes.body.passThreshold).toBe(0.6);
      expect(createSimceRes.body.passThresholdPercent).toBe(60);
    });

    test('2. Guardar pauta con gradingMode/exigencia y probar Mocktest en ambos modos', async () => {
      const akRes = await request(app)
        .put(`/api/admin/exams/${normalExamId}/answer-key`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          totalQuestions: 5,
          gradingMode: 'NORMAL',
          passThresholdPercent: 70,
          answerKey: { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'A' },
          questionTypesKeys: { '1': 'MULTIPLE_CHOICE', '2': 'MULTIPLE_CHOICE', '3': 'MULTIPLE_CHOICE', '4': 'MULTIPLE_CHOICE', '5': 'MULTIPLE_CHOICE' },
          maxPointsKeys: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 },
          skillsKeys: { '1': 'Analizar', '2': 'Analizar', '3': 'Resolver', '4': 'Resolver', '5': 'Modelar' },
          axesKeys: { '1': 'Números', '2': 'Números', '3': 'Geometría', '4': 'Geometría', '5': 'Datos' },
        });
      expect(akRes.status).toBe(200);
      expect(akRes.body.gradingMode).toBe('NORMAL');
      expect(akRes.body.passThreshold).toBe(0.7);
      expect(akRes.body.passThresholdPercent).toBe(70);

      const sessionRes = await request(app)
        .post(`/api/admin/exams/${normalExamId}/mock-session`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body.exam.gradingMode).toBe('NORMAL');
      expect(sessionRes.body.exam.passThresholdPercent).toBe(70);

      const questions = sessionRes.body.questions;
      expect(questions.length).toBe(5);

      // Responder 3 de 5 (60%) => al 70% de exigencia debe dar nota 3.6 y simceScore null
      const mockGradeNormal = await request(app)
        .post(`/api/admin/exams/${normalExamId}/mock-grade`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          answers: {
            [questions[0].id]: 'A',
            [questions[1].id]: 'B',
            [questions[2].id]: 'C',
            [questions[3].id]: 'A',
            [questions[4].id]: 'B',
          },
        });
      expect(mockGradeNormal.status).toBe(200);
      expect(mockGradeNormal.body.gradingMode).toBe('NORMAL');
      expect(mockGradeNormal.body.passThresholdPercent).toBe(70);
      expect(mockGradeNormal.body.simceScore).toBeNull();
      expect(mockGradeNormal.body.theta).toBeNull();
      expect(mockGradeNormal.body.grade).toBe(3.6);
      expect(mockGradeNormal.body.achievementLevel).toBe('INSUFICIENTE');

      // Simular preview con 50% sin persistir cambio en BD
      const mockGradeOverride = await request(app)
        .post(`/api/admin/exams/${normalExamId}/mock-grade`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          gradingMode: 'SIMCE',
          passThresholdPercent: 50,
          answers: {
            [questions[0].id]: 'A',
            [questions[1].id]: 'B',
            [questions[2].id]: 'C',
            [questions[3].id]: 'A',
            [questions[4].id]: 'B',
          },
        });
      expect(mockGradeOverride.status).toBe(200);
      expect(mockGradeOverride.body.gradingMode).toBe('SIMCE');
      expect(mockGradeOverride.body.simceScore).toBeGreaterThanOrEqual(100);
      expect(mockGradeOverride.body.grade).toBe(4.6);

      // Confirmar que BD sigue en NORMAL / 70%
      const examGetRes = await request(app)
        .get(`/api/admin/exams/${normalExamId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(examGetRes.status).toBe(200);
      expect(examGetRes.body.gradingMode).toBe('NORMAL');
      expect(examGetRes.body.passThresholdPercent).toBe(70);
    });

    test('3. Rendición real estudiante en Prueba Normal, vistas Docente/Dashboard sin SIMCE sintético y recálculo al cambiar exigencia o modo', async () => {
      const now = new Date();
      normalAssignment = await prisma.examAssignment.create({
        data: {
          examId: normalExamId,
          courseId: course.id,
          assignedTeacherRut: teacherRut,
          opensAt: new Date(now.getTime() - 3600 * 1000),
          closesAt: new Date(now.getTime() + 3600 * 1000),
          status: 'ONGOING',
          released: true,
        },
      });

      const examDetail = await prisma.exam.findUnique({
        where: { id: normalExamId },
        include: { questions: { orderBy: { questionNumber: 'asc' } } },
      });
      const qs = examDetail.questions;

      // Otro estudiante queda IN_PROGRESS para verificar no interferencia
      inProgressSub = await prisma.submission.create({
        data: {
          studentRut: inProgressStudentRut,
          assignmentId: normalAssignment.id,
          status: 'IN_PROGRESS',
          answers: {
            create: [{ questionId: qs[0].id, selectedAnswer: 'A', isCorrect: null }],
          },
        },
      });

      // Estudiante 1 inicia, responde 3 de 5 (60%) y entrega
      const startRes = await request(app)
        .post(`/api/student/assignments/${normalAssignment.id}/start`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(startRes.status).toBe(200);
      expect(startRes.body.exam.gradingMode).toBe('NORMAL');
      expect(startRes.body.exam.passThresholdPercent).toBe(70);

      const subId = startRes.body.submissionId;

      const putAnsRes = await request(app)
        .put(`/api/student/submissions/${subId}/answers`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          answers: [
            { questionId: qs[0].id, selectedAnswer: 'A' },
            { questionId: qs[1].id, selectedAnswer: 'B' },
            { questionId: qs[2].id, selectedAnswer: 'C' },
            { questionId: qs[3].id, selectedAnswer: 'A' },
            { questionId: qs[4].id, selectedAnswer: 'B' },
          ],
        });
      expect(putAnsRes.status).toBe(200);

      const submitRes = await request(app)
        .post(`/api/student/submissions/${subId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(submitRes.status).toBe(200);

      const dbSubInitial = await prisma.submission.findUnique({ where: { id: subId } });
      expect(dbSubInitial.status).toBe('SUBMITTED');
      expect(dbSubInitial.simceScore).toBeNull();
      expect(dbSubInitial.theta).toBeNull();
      expect(dbSubInitial.grade).toBe(3.6);
      expect(dbSubInitial.achievementLevel).toBe('INSUFICIENTE');

      // Resultado estudiante
      const studentResultRes = await request(app)
        .get(`/api/student/submissions/${subId}/result`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(studentResultRes.status).toBe(200);
      expect(studentResultRes.body.gradingMode).toBe('NORMAL');
      expect(studentResultRes.body.passThresholdPercent).toBe(70);
      expect(studentResultRes.body.simceScore).toBeNull();
      expect(studentResultRes.body.theta).toBeNull();
      expect(studentResultRes.body.grade).toBe(3.6);
      expect(studentResultRes.body.maxScore).toBe(5);
      expect(studentResultRes.body.totalScore).toBe(3);

      // Trayectoria estudiante no inventa SIMCE
      const trajRes = await request(app)
        .get('/api/student/trajectory')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(trajRes.status).toBe(200);
      const trajItem = trajRes.body.trajectory.find((t) => t.id === subId);
      expect(trajItem).toBeDefined();
      expect(trajItem.gradingMode).toBe('NORMAL');
      expect(trajItem.simceScore).toBeNull();

      // Docente summary / live / evolution / student profile tampoco inventan SIMCE
      const sumRes = await request(app)
        .get(`/api/teacher/assignments/${normalAssignment.id}/summary`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(sumRes.status).toBe(200);
      expect(sumRes.body.gradingMode).toBe('NORMAL');
      expect(sumRes.body.passThresholdPercent).toBe(70);
      expect(sumRes.body.averageSimceScore).toBeNull();

      const liveRes = await request(app)
        .get(`/api/teacher/assignments/${normalAssignment.id}/live`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(liveRes.status).toBe(200);
      expect(liveRes.body.gradingMode).toBe('NORMAL');
      const liveStudent = liveRes.body.students.find((s) => s.rut === studentRut);
      expect(liveStudent.simceScore).toBeNull();

      const evoRes = await request(app)
        .get(`/api/teacher/assignments/${normalAssignment.id}/evolution`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(evoRes.status).toBe(200);
      const evoEntry = evoRes.body.timeline.find((t) => t.assignmentId === normalAssignment.id);
      expect(evoEntry.gradingMode).toBe('NORMAL');
      expect(evoEntry.avgSimceScore).toBeNull();

      // Dashboard Admin y Multiannual (año 2097) tampoco inventan SIMCE
      const dashRes = await request(app)
        .get('/api/admin/dashboard?year=2097')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(dashRes.status).toBe(200);
      const evoCourseList = dashRes.body.evolution['5B'] || [];
      const dashItem = evoCourseList.find((e) => e.examId === normalExamId);
      expect(dashItem).toBeDefined();
      expect(dashItem.gradingMode).toBe('NORMAL');
      expect(dashItem.avgSimce).toBeNull();

      // Cambiar exigencia a 50% mediante PUT /admin/exams/:id y recalcular
      const putExamRes = await request(app)
        .put(`/api/admin/exams/${normalExamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ gradingMode: 'NORMAL', passThresholdPercent: 50 });
      expect(putExamRes.status).toBe(200);
      expect(putExamRes.body.passThreshold).toBe(0.5);
      expect(putExamRes.body.passThresholdPercent).toBe(50);

      const recalc50Res = await request(app)
        .post(`/api/admin/exams/${normalExamId}/recalculate-grades`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(recalc50Res.status).toBe(200);
      expect(recalc50Res.body.updatedGradesCount).toBe(1);
      expect(recalc50Res.body.gradingMode).toBe('NORMAL');
      expect(recalc50Res.body.passThresholdPercent).toBe(50);

      const dbSub50 = await prisma.submission.findUnique({ where: { id: subId } });
      expect(dbSub50.grade).toBe(4.6);
      expect(dbSub50.achievementLevel).toBe('ELEMENTAL');
      expect(dbSub50.simceScore).toBeNull();
      expect(dbSub50.theta).toBeNull();

      // Cambiar modalidad NORMAL -> SIMCE con exigencia 60% y recalcular
      await request(app)
        .put(`/api/admin/exams/${normalExamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ gradingMode: 'SIMCE', passThresholdPercent: 60 });

      const recalcSimceRes = await request(app)
        .post(`/api/admin/exams/${normalExamId}/recalculate-grades`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(recalcSimceRes.status).toBe(200);
      expect(recalcSimceRes.body.gradingMode).toBe('SIMCE');
      expect(recalcSimceRes.body.passThresholdPercent).toBe(60);

      const dbSubSimce = await prisma.submission.findUnique({ where: { id: subId } });
      expect(dbSubSimce.grade).toBe(4.0);
      expect(dbSubSimce.simceScore).toBeGreaterThanOrEqual(100);
      expect(dbSubSimce.theta).not.toBeNull();

      // Volver SIMCE -> NORMAL al 60% y recalcular debe limpiar simceScore/theta/seTheta a null
      await request(app)
        .put(`/api/admin/exams/${normalExamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ gradingMode: 'NORMAL', passThresholdPercent: 60 });

      const recalcBackNormal = await request(app)
        .post(`/api/admin/exams/${normalExamId}/recalculate-grades`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(recalcBackNormal.status).toBe(200);
      expect(recalcBackNormal.body.updatedCount).toBe(1);

      const dbSubBackNormal = await prisma.submission.findUnique({ where: { id: subId } });
      expect(dbSubBackNormal.grade).toBe(4.0);
      expect(dbSubBackNormal.simceScore).toBeNull();
      expect(dbSubBackNormal.theta).toBeNull();
      expect(dbSubBackNormal.seTheta).toBeNull();

      // Verificar IN_PROGRESS intacto
      const dbInProg = await prisma.submission.findUnique({ where: { id: inProgressSub.id } });
      expect(dbInProg.status).toBe('IN_PROGRESS');
      expect(dbInProg.grade).toBeNull();
      expect(dbInProg.simceScore).toBeNull();
    });

    test('4. Puntaje ponderado por pregunta en modo NORMAL: creación, pauta, mocktest, alumno, docente, Excel y recálculo', async () => {
      // Validación HTTP 400 ante puntajes inválidos en creación
      const badDefaultPtsRes = await request(app)
        .post('/api/admin/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Prueba Inválida Puntaje Base')
        .field('subject', 'Matemática')
        .field('level', '5B')
        .field('questionCount', '4')
        .field('gradingMode', 'NORMAL')
        .field('defaultMcPoints', '0')
        .attach('pdf', dummyPdf, 'bad-default-pts.pdf');
      expect(badDefaultPtsRes.status).toBe(400);

      const badQuestionPtsRes = await request(app)
        .post('/api/admin/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Prueba Inválida Puntaje Individual')
        .field('subject', 'Matemática')
        .field('level', '5B')
        .field('questionCount', '4')
        .field('gradingMode', 'NORMAL')
        .field('questionPoints', JSON.stringify({ '1': -2 }))
        .attach('pdf', dummyPdf, 'bad-q-pts.pdf');
      expect(badQuestionPtsRes.status).toBe(400);

      // Creación con defaultMcPoints=2, questionPoints={1:3, 3:1.5} y openQuestions en formato mapa objeto (#4 escrita 5 pts)
      // Total esperado: P1(3) + P2(2) + P3(1.5) + P4(5) = 11.5 pts
      const createWeightedRes = await request(app)
        .post('/api/admin/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Prueba Normal Puntaje por Pregunta')
        .field('subject', 'Matemática')
        .field('level', '5B')
        .field('questionCount', '4')
        .field('optionsCount', '4')
        .field('orderNumber', '97')
        .field('gradingMode', 'NORMAL')
        .field('passThresholdPercent', '60')
        .field('defaultMcPoints', '2')
        .field('questionPoints', JSON.stringify({ '1': 3, '3': 1.5 }))
        .field('openQuestions', JSON.stringify({ '4': { questionType: 'WRITTEN', maxPoints: 5 } }))
        .attach('pdf', dummyPdf, 'weighted-normal.pdf');

      weightedExamId = createWeightedRes.body?.id;
      if (createWeightedRes.body?.pdfPath) uploadedPdfPaths.push(createWeightedRes.body.pdfPath);

      expect(createWeightedRes.status).toBe(200);
      expect(createWeightedRes.body.gradingMode).toBe('NORMAL');
      expect(createWeightedRes.body.maxPointsKeys).toEqual({ '1': 3, '2': 2, '3': 1.5, '4': 5 });
      expect(createWeightedRes.body.totalMaxPoints).toBe(11.5);
      expect(createWeightedRes.body.hasWeightedPoints).toBe(true);

      // Catálogo GET /exams expone maxPointsKeys, totalMaxPoints y hasWeightedPoints
      const catalogRes = await request(app)
        .get('/api/admin/exams')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(catalogRes.status).toBe(200);
      const listed = catalogRes.body.find((item) => item.id === weightedExamId);
      expect(listed).toBeDefined();
      expect(listed.maxPointsKeys).toEqual({ '1': 3, '2': 2, '3': 1.5, '4': 5 });
      expect(listed.totalMaxPoints).toBe(11.5);
      expect(listed.hasWeightedPoints).toBe(true);

      // Validación 400 en PUT /exams/:id y PUT /exams/:id/answer-key con puntaje <= 0
      const badPutPtsRes = await request(app)
        .put(`/api/admin/exams/${weightedExamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ gradingMode: 'NORMAL', maxPointsKeys: { '2': 0 } });
      expect(badPutPtsRes.status).toBe(400);

      const badAkPtsRes = await request(app)
        .put(`/api/admin/exams/${weightedExamId}/answer-key`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ totalQuestions: 4, answerKey: { '1': 'A' }, maxPointsKeys: { '1': -1 } });
      expect(badAkPtsRes.status).toBe(400);

      // Actualizar pauta completa con 4 MC ponderadas: P1=2, P2=2, P3=3, P4=3 => Total = 10 pts
      // Con 60% exigencia, 6 pts = 60% => nota 4.0
      const akWeightedRes = await request(app)
        .put(`/api/admin/exams/${weightedExamId}/answer-key`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          totalQuestions: 4,
          gradingMode: 'NORMAL',
          passThresholdPercent: 60,
          answerKey: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
          questionTypesKeys: {
            '1': 'MULTIPLE_CHOICE',
            '2': 'MULTIPLE_CHOICE',
            '3': 'MULTIPLE_CHOICE',
            '4': 'MULTIPLE_CHOICE',
          },
          maxPointsKeys: { '1': 2, '2': 2, '3': 3, '4': 3 },
          skillsKeys: { '1': 'Calcular', '2': 'Calcular', '3': 'Resolver', '4': 'Modelar' },
          axesKeys: { '1': 'Números', '2': 'Números', '3': 'Álgebra', '4': 'Geometría' },
        });
      expect(akWeightedRes.status).toBe(200);
      expect(akWeightedRes.body.maxPointsKeys).toEqual({ '1': 2, '2': 2, '3': 3, '4': 3 });
      expect(akWeightedRes.body.totalMaxPoints).toBe(10);

      // Mocktest: responde P1(2), P2(2), P4(3) buenas => 7 / 10 pts = 70% => nota 4.8
      const mockSess = await request(app)
        .post(`/api/admin/exams/${weightedExamId}/mock-session`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(mockSess.status).toBe(200);
      const mQuestions = mockSess.body.questions;
      expect(mQuestions.map((q) => q.maxPoints)).toEqual([2, 2, 3, 3]);

      const mockGrade = await request(app)
        .post(`/api/admin/exams/${weightedExamId}/mock-grade`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          answers: {
            [mQuestions[0].id]: 'A', // +2
            [mQuestions[1].id]: 'B', // +2
            [mQuestions[2].id]: 'A', // 0
            [mQuestions[3].id]: 'D', // +3
          },
        });
      expect(mockGrade.status).toBe(200);
      expect(mockGrade.body.earnedPoints).toBe(7);
      expect(mockGrade.body.maxPoints).toBe(10);
      expect(mockGrade.body.questionCount).toBe(4);
      expect(mockGrade.body.hasWeightedPoints).toBe(true);
      expect(mockGrade.body.percent).toBe(70);
      expect(mockGrade.body.grade).toBe(4.8);
      expect(mockGrade.body.simceScore).toBeNull();

      // Rendición real del estudiante: responde P1(A:+2) y P3(C:+3) => 5 / 10 pts = 50% (<60% => 3.5)
      const now = new Date();
      weightedAssignment = await prisma.examAssignment.create({
        data: {
          examId: weightedExamId,
          courseId: course.id,
          assignedTeacherRut: teacherRut,
          opensAt: new Date(now.getTime() - 3600 * 1000),
          closesAt: new Date(now.getTime() + 3600 * 1000),
          status: 'ONGOING',
          released: true,
        },
      });

      const startWeighted = await request(app)
        .post(`/api/student/assignments/${weightedAssignment.id}/start`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(startWeighted.status).toBe(200);
      expect(startWeighted.body.questions.map((q) => q.maxPoints)).toEqual([2, 2, 3, 3]);
      const wSubId = startWeighted.body.submissionId;

      await request(app)
        .put(`/api/student/submissions/${wSubId}/answers`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          answers: [
            { questionId: mQuestions[0].id, selectedAnswer: 'A' },
            { questionId: mQuestions[1].id, selectedAnswer: 'D' },
            { questionId: mQuestions[2].id, selectedAnswer: 'C' },
            { questionId: mQuestions[3].id, selectedAnswer: 'A' },
          ],
        });

      const submitWeighted = await request(app)
        .post(`/api/student/submissions/${wSubId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(submitWeighted.status).toBe(200);

      // Resultado estudiante muestra totalScore=5, maxScore=10, questionCount=4, hasWeightedPoints=true
      const sResultWeighted = await request(app)
        .get(`/api/student/submissions/${wSubId}/result`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(sResultWeighted.status).toBe(200);
      expect(sResultWeighted.body.totalScore).toBe(5);
      expect(sResultWeighted.body.maxScore).toBe(10);
      expect(sResultWeighted.body.questionCount).toBe(4);
      expect(sResultWeighted.body.hasWeightedPoints).toBe(true);
      expect(sResultWeighted.body.percent).toBe(50);
      expect(sResultWeighted.body.grade).toBe(3.5);

      // Vista Live Docente expone earnedPoints=5, correctQuestionsCount=2, maxTotalPoints=10, hasWeightedPoints=true
      const liveWeighted = await request(app)
        .get(`/api/teacher/assignments/${weightedAssignment.id}/live`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(liveWeighted.status).toBe(200);
      expect(liveWeighted.body.maxTotalPoints).toBe(10);
      expect(liveWeighted.body.hasWeightedPoints).toBe(true);
      const stLive = liveWeighted.body.students.find((s) => s.rut === studentRut);
      expect(stLive.earnedPoints).toBe(5);
      expect(stLive.correctQuestionsCount).toBe(2);
      expect(stLive.maxTotalPoints).toBe(10);

      // Vista Skills Docente usa puntajes ponderados (Calcular=2/4=50%, Resolver=3/3=100%)
      const skillsWeighted = await request(app)
        .get(`/api/teacher/assignments/${weightedAssignment.id}/skills`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(skillsWeighted.status).toBe(200);
      const calcSkill = skillsWeighted.body.skills.find((sk) => sk.name === 'Calcular');
      expect(calcSkill).toEqual({ name: 'Calcular', correct: 2, total: 4, percent: 0.5 });

      // Exportación Excel: Sheet 1 incluye 'Puntaje' ('5 / 10 pts') y Sheet 3 usa Puntos Posibles ponderados
      const excelRes = await request(app)
        .get(`/api/teacher/assignments/${weightedAssignment.id}/export.xlsx`)
        .set('Authorization', `Bearer ${adminToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(excelRes.status).toBe(200);

      const wb = new exceljs.Workbook();
      await wb.xlsx.load(excelRes.body);
      const sheet1 = wb.getWorksheet('Resultados Alumnos');
      const headerRow1 = sheet1.getRow(1).values;
      expect(headerRow1).toContain('Puntaje');
      const rowsSheet1 = [];
      sheet1.eachRow((row, rowNumber) => {
        if (rowNumber > 1) rowsSheet1.push(row.values);
      });
      const studentRowValues = rowsSheet1.find((r) => r[1] === studentRut);
      expect(studentRowValues).toBeDefined();
      expect(studentRowValues).toContain('5 / 10 pts');

      const sheet3 = wb.getWorksheet('Habilidades y Ejes');
      const rowsSheet3 = [];
      sheet3.eachRow((row, rowNumber) => {
        if (rowNumber > 1) rowsSheet3.push(row.values);
      });
      const calcRow = rowsSheet3.find((r) => r[2] === 'Calcular');
      expect(calcRow).toBeDefined();
      expect(calcRow[4]).toBe(2); // Puntos Obtenidos (P1=2)
      expect(calcRow[5]).toBe(4); // Puntos Posibles (P1=2 + P2=2)

      // Cambiar puntajes desde modal Calificación (PUT /admin/exams/:id): subir P3 de 3 a 6 pts => total 13, alumno 8/13 = 61.5% => >= 4.0 tras recálculo!
      const putWeightsRes = await request(app)
        .put(`/api/admin/exams/${weightedExamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          gradingMode: 'NORMAL',
          passThresholdPercent: 60,
          maxPointsKeys: { '1': 2, '2': 2, '3': 6, '4': 3 },
        });
      expect(putWeightsRes.status).toBe(200);
      expect(putWeightsRes.body.totalMaxPoints).toBe(13);

      const recalcWeightedRes = await request(app)
        .post(`/api/admin/exams/${weightedExamId}/recalculate-grades`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(recalcWeightedRes.status).toBe(200);
      expect(recalcWeightedRes.body.updatedGradesCount).toBe(1);

      const subAfterWeightRecalc = await prisma.submission.findUnique({ where: { id: wSubId } });
      expect(subAfterWeightRecalc.percent).toBe(61.5);
      expect(subAfterWeightRecalc.grade).toBe(4.1);
      expect(subAfterWeightRecalc.achievementLevel).toBe('ELEMENTAL');
    });
  });
});
