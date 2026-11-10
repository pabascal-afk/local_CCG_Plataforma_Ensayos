require('dotenv').config();
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
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
  let normalAssignment;
  let inProgressSub;

  beforeAll(async () => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    // Limpiar posibles restos de ejecuciones previas fallidas
    await prisma.exam.deleteMany({
      where: { title: { in: ['Prueba Normal Geometría 70%', 'Ensayo SIMCE Default 60%'] } },
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
    if (normalAssignment?.id) {
      await prisma.examAssignment.delete({ where: { id: normalAssignment.id } }).catch(() => {});
    }
    for (const eid of [normalExamId, simceExamId].filter(Boolean)) {
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
  });
});
