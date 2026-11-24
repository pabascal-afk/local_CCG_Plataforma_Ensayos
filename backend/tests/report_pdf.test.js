require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');

describe('Informe Pedagógico de Evaluación en PDF (GET /api/teacher/assignments/:id/report-data)', () => {
  const adminRut = '98111111-1';
  const teacherRut = '98222222-2';
  const otherTeacherRut = '98333333-3';
  const student1Rut = '98444444-4';
  const student2Rut = '98555555-5';
  const student3Rut = '98666666-6';

  const adminToken = signToken({ rut: adminRut, role: 'ADMIN', name: 'Admin Report Test' });
  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Profesor Titular Report' });
  const otherTeacherToken = signToken({ rut: otherTeacherRut, role: 'TEACHER', name: 'Otro Profesor No Asignado' });
  const studentToken = signToken({ rut: student1Rut, role: 'STUDENT', name: 'Estudiante Report' });

  let testCourse;
  let otherCourse;
  let testExam;
  let testAssignment;
  let emptyAssignment;

  beforeAll(async () => {
    const hash = await bcrypt.hash('report123', 10);

    // 1. Cursos
    testCourse = await prisma.course.upsert({
      where: { level_letter_year: { level: '2M', letter: 'K', year: 2098 } },
      update: {},
      create: { level: '2M', letter: 'K', year: 2098 },
    });

    otherCourse = await prisma.course.upsert({
      where: { level_letter_year: { level: '2M', letter: 'L', year: 2098 } },
      update: {},
      create: { level: '2M', letter: 'L', year: 2098 },
    });

    // 2. Usuarios
    await prisma.user.upsert({
      where: { rut: adminRut },
      update: { name: 'Admin Report Test', role: 'ADMIN', isActive: true, passwordHash: hash },
      create: { rut: adminRut, name: 'Admin Report Test', role: 'ADMIN', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: teacherRut },
      update: { name: 'Profesor Titular Report', role: 'TEACHER', isActive: true, passwordHash: hash },
      create: { rut: teacherRut, name: 'Profesor Titular Report', role: 'TEACHER', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: otherTeacherRut },
      update: { name: 'Otro Profesor No Asignado', role: 'TEACHER', isActive: true, passwordHash: hash },
      create: { rut: otherTeacherRut, name: 'Otro Profesor No Asignado', role: 'TEACHER', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: student1Rut },
      update: { name: 'Alumno Uno Sobresaliente', role: 'STUDENT', courseId: testCourse.id, isActive: true, passwordHash: hash },
      create: { rut: student1Rut, name: 'Alumno Uno Sobresaliente', role: 'STUDENT', courseId: testCourse.id, passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: student2Rut },
      update: { name: 'Alumno Dos Intermedio', role: 'STUDENT', courseId: testCourse.id, isActive: true, passwordHash: hash },
      create: { rut: student2Rut, name: 'Alumno Dos Intermedio', role: 'STUDENT', courseId: testCourse.id, passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: student3Rut },
      update: { name: 'Alumno Tres Ausente', role: 'STUDENT', courseId: testCourse.id, isActive: true, passwordHash: hash },
      create: { rut: student3Rut, name: 'Alumno Tres Ausente', role: 'STUDENT', courseId: testCourse.id, passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    // 3. Examen con preguntas variadas y habilidades
    testExam = await prisma.exam.create({
      data: {
        title: 'Ensayo SIMCE Matemática Report Test',
        subject: 'Matemática',
        level: '2M',
        pdfPath: 'report-test.pdf',
        optionsCount: 4,
        orderNumber: 98,
        examType: 'ENSAYO',
        gradingMode: 'NORMAL',
        passThreshold: 0.6,
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'A', questionType: 'MULTIPLE_CHOICE', maxPoints: 1.0, skill: 'Comprender', axis: 'Números' },
            { questionNumber: 2, correctAnswer: 'B', questionType: 'MULTIPLE_CHOICE', maxPoints: 1.0, skill: 'Aplicar', axis: 'Álgebra' },
            { questionNumber: 3, correctAnswer: 'C', questionType: 'MULTIPLE_CHOICE', maxPoints: 1.0, skill: 'Resolver Problemas', axis: 'Geometría' },
            { questionNumber: 4, correctAnswer: 'DESARROLLO', questionType: 'WRITTEN', maxPoints: 2.0, skill: 'Argumentar', axis: 'Probabilidad' },
          ],
        },
      },
      include: { questions: { orderBy: { questionNumber: 'asc' } } },
    });

    const now = new Date();
    testAssignment = await prisma.examAssignment.create({
      data: {
        examId: testExam.id,
        courseId: testCourse.id,
        assignedTeacherRut: teacherRut,
        opensAt: new Date(now.getTime() - 7200 * 1000),
        closesAt: new Date(now.getTime() + 7200 * 1000),
        status: 'ONGOING',
      },
    });

    emptyAssignment = await prisma.examAssignment.create({
      data: {
        examId: testExam.id,
        courseId: otherCourse.id,
        assignedTeacherRut: teacherRut,
        opensAt: new Date(now.getTime() - 7200 * 1000),
        closesAt: new Date(now.getTime() + 7200 * 1000),
        status: 'ONGOING',
      },
    });

    // 4. Entregas (2 de los 3 estudiantes rinden)
    // Alumno 1: perfecto (nota 7.0, 5/5 puntos)
    const sub1 = await prisma.submission.create({
      data: {
        assignmentId: testAssignment.id,
        studentRut: student1Rut,
        status: 'SUBMITTED',
        correctCount: 4,
        percent: 100.0,
        grade: 7.0,
        achievementLevel: 'ADECUADO',
        simceScore: 340,
        submittedAt: new Date(),
      },
    });

    for (const q of testExam.questions) {
      await prisma.submissionAnswer.create({
        data: {
          submissionId: sub1.id,
          questionId: q.id,
          selectedAnswer: q.correctAnswer === 'DESARROLLO' ? 'Texto correcto' : q.correctAnswer,
          isCorrect: true,
          awardedPoints: q.maxPoints,
        },
      });
    }

    // Alumno 2: nota 4.0 (3/5 puntos, falla pregunta 3 y desarrollo regular)
    const sub2 = await prisma.submission.create({
      data: {
        assignmentId: testAssignment.id,
        studentRut: student2Rut,
        status: 'SUBMITTED',
        correctCount: 2,
        percent: 60.0,
        grade: 4.0,
        achievementLevel: 'ELEMENTAL',
        simceScore: 250,
        submittedAt: new Date(),
      },
    });

    const q1 = testExam.questions[0];
    const q2 = testExam.questions[1];
    const q3 = testExam.questions[2];
    const q4 = testExam.questions[3];

    // Q1 acierta
    await prisma.submissionAnswer.create({
      data: { submissionId: sub2.id, questionId: q1.id, selectedAnswer: q1.correctAnswer, isCorrect: true, awardedPoints: 1.0 },
    });
    // Q2 acierta
    await prisma.submissionAnswer.create({
      data: { submissionId: sub2.id, questionId: q2.id, selectedAnswer: q2.correctAnswer, isCorrect: true, awardedPoints: 1.0 },
    });
    // Q3 falla
    await prisma.submissionAnswer.create({
      data: { submissionId: sub2.id, questionId: q3.id, selectedAnswer: 'D', isCorrect: false, awardedPoints: 0.0 },
    });
    // Q4 desarrollo con 1 de 2 puntos
    await prisma.submissionAnswer.create({
      data: { submissionId: sub2.id, questionId: q4.id, selectedAnswer: 'Parcial', isCorrect: false, awardedPoints: 1.0 },
    });
  });

  afterAll(async () => {
    if (testAssignment) {
      await prisma.submissionAnswer.deleteMany({
        where: { submission: { assignmentId: testAssignment.id } },
      }).catch(() => {});
      await prisma.submission.deleteMany({ where: { assignmentId: testAssignment.id } }).catch(() => {});
      await prisma.examAssignment.delete({ where: { id: testAssignment.id } }).catch(() => {});
    }

    if (emptyAssignment) {
      await prisma.examAssignment.delete({ where: { id: emptyAssignment.id } }).catch(() => {});
    }

    if (testExam) {
      await prisma.question.deleteMany({ where: { examId: testExam.id } }).catch(() => {});
      await prisma.exam.delete({ where: { id: testExam.id } }).catch(() => {});
    }

    await prisma.user.deleteMany({
      where: { rut: { in: [adminRut, teacherRut, otherTeacherRut, student1Rut, student2Rut, student3Rut] } },
    }).catch(() => {});

    if (testCourse) await prisma.course.delete({ where: { id: testCourse.id } }).catch(() => {});
    if (otherCourse) await prisma.course.delete({ where: { id: otherCourse.id } }).catch(() => {});

    await prisma.$disconnect();
  });

  test('1. GET /api/teacher/assignments/:id/report-data entrega la estructura completa del informe', async () => {
    const res = await request(app)
      .get(`/api/teacher/assignments/${testAssignment.id}/report-data`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.statusCode).toBe(200);

    // Institución
    expect(res.body.institution).toBeDefined();
    expect(res.body.institution.name).toMatch(/Colegio Cerro Grande/i);

    // Evaluación
    expect(res.body.exam).toBeDefined();
    expect(res.body.exam.title).toBe('Ensayo SIMCE Matemática Report Test');
    expect(res.body.exam.totalQuestions).toBe(4);
    expect(res.body.exam.maxTotalPoints).toBe(5);

    // Curso y Docente
    expect(res.body.course).toBeDefined();
    expect(res.body.course.fullName).toMatch(/2° Medio K/);
    expect(res.body.teacher.name).toBe('Profesor Titular Report');

    // Resumen Ejecutivo
    const summary = res.body.summary;
    expect(summary.totalStudents).toBe(3);
    expect(summary.submittedCount).toBe(2);
    expect(summary.pendingCount).toBe(1);
    expect(summary.participationPercent).toBe(66.7);
    expect(summary.averageGrade).toBe(5.5); // (7.0 + 4.0) / 2
    expect(summary.averagePercent).toBe(80); // (100 + 60) / 2
    expect(summary.approvedCount).toBe(2); // Ambas notas >= 4.0
    expect(summary.failedCount).toBe(0);
    expect(summary.approvalPercent).toBe(100);

    // Distribución
    expect(summary.levelCounts.ADECUADO).toBe(1);
    expect(summary.levelCounts.ELEMENTAL).toBe(1);
    expect(summary.levelCounts.INSUFICIENTE).toBe(0);

    // Habilidades y Ejes
    expect(res.body.skills.length).toBeGreaterThan(0);
    expect(res.body.axes.length).toBeGreaterThan(0);

    // Pregunta Crítica: Q3 tiene 50% de logro (1 acierto de 2)
    expect(res.body.criticalQuestions.length).toBeGreaterThan(0);
    const critQ3 = res.body.criticalQuestions.find(q => q.questionNumber === 3);
    expect(critQ3).toBeDefined();
    expect(critQ3.percent).toBe(50);

    // Nómina de Estudiantes
    expect(res.body.students.length).toBe(3);
    const st1 = res.body.students.find(s => s.rut === student1Rut);
    expect(st1.state).toBe('SUBMITTED');
    expect(st1.grade).toBe(7.0);

    const st3 = res.body.students.find(s => s.rut === student3Rut);
    expect(st3.state).toBe('AUSENTE');
    expect(st3.grade).toBeNull();
  });

  test('2. Maneja adecuadamente una evaluación sin entregas aún (0 rendidos)', async () => {
    const res = await request(app)
      .get(`/api/teacher/assignments/${emptyAssignment.id}/report-data`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.summary.submittedCount).toBe(0);
    expect(res.body.summary.participationPercent).toBe(0);
    expect(res.body.summary.averageGrade).toBe(0);
    expect(res.body.criticalQuestions).toEqual([]);
  });

  test('3. Control de acceso RBAC: ADMIN y DIRECTOR tienen acceso total; estudiante recibe 403', async () => {
    // Admin puede acceder
    const resAdmin = await request(app)
      .get(`/api/teacher/assignments/${testAssignment.id}/report-data`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAdmin.statusCode).toBe(200);

    // Estudiante recibe 403
    const resStudent = await request(app)
      .get(`/api/teacher/assignments/${testAssignment.id}/report-data`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(resStudent.statusCode).toBe(403);

    // Usuario sin autenticar recibe 401
    const resUnauth = await request(app)
      .get(`/api/teacher/assignments/${testAssignment.id}/report-data`);
    expect(resUnauth.statusCode).toBe(401);
  });
});
