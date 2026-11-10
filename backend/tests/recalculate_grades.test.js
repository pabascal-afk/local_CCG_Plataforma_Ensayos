require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const { computeResults } = require('../src/services/grading');

describe('Recálculo masivo de notas post-rendición con pauta actual', () => {
  const adminToken = signToken({ rut: '11111111-1', role: 'ADMIN', name: 'Admin Recalc Test' });
  const directorToken = signToken({ rut: '22222222-2', role: 'DIRECTOR', name: 'Director Recalc Test' });
  const teacherRut = '18888777-6';
  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Docente Recalc Test' });
  const student1Rut = '19991111-1';
  const student2Rut = '19991111-2';
  const student3Rut = '19991111-3';
  const studentToken = signToken({ rut: student1Rut, role: 'STUDENT', name: 'Alumno 1 Recalc' });

  let courseA;
  let courseB;
  let examMain;
  let examOther;
  let assignmentA;
  let assignmentB;
  let assignmentOther;
  let sub1;
  let sub2;
  let sub3InProgress;
  let subOther;

  beforeAll(async () => {
    const hash = await bcrypt.hash('test1234', 10);

    courseA = await prisma.course.upsert({
      where: { level_letter_year: { level: '6B', letter: 'Y', year: 2098 } },
      update: {},
      create: { level: '6B', letter: 'Y', year: 2098 }
    });

    courseB = await prisma.course.upsert({
      where: { level_letter_year: { level: '6B', letter: 'Z', year: 2098 } },
      update: {},
      create: { level: '6B', letter: 'Z', year: 2098 }
    });

    await prisma.user.upsert({
      where: { rut: teacherRut },
      update: { role: 'TEACHER', isActive: true },
      create: {
        rut: teacherRut,
        name: 'Docente Recalc Test',
        role: 'TEACHER',
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true
      }
    });

    await prisma.user.upsert({
      where: { rut: student1Rut },
      update: { courseId: courseA.id, role: 'STUDENT', isActive: true },
      create: {
        rut: student1Rut,
        name: 'Alumno 1 Recalc',
        role: 'STUDENT',
        courseId: courseA.id,
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true
      }
    });

    await prisma.user.upsert({
      where: { rut: student2Rut },
      update: { courseId: courseB.id, role: 'STUDENT', isActive: true },
      create: {
        rut: student2Rut,
        name: 'Alumno 2 Recalc',
        role: 'STUDENT',
        courseId: courseB.id,
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true
      }
    });

    await prisma.user.upsert({
      where: { rut: student3Rut },
      update: { courseId: courseA.id, role: 'STUDENT', isActive: true },
      create: {
        rut: student3Rut,
        name: 'Alumno 3 InProgress',
        role: 'STUDENT',
        courseId: courseA.id,
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true
      }
    });

    await prisma.teacherCourse.upsert({
      where: { teacherRut_courseId: { teacherRut, courseId: courseA.id } },
      update: {},
      create: { teacherRut, courseId: courseA.id }
    });

    examMain = await prisma.exam.create({
      data: {
        title: 'Prueba Recálculo Post-Rendición Test',
        subject: 'Matemática',
        level: '6B',
        pdfPath: 'test-recalc-main.pdf',
        optionsCount: 4,
        orderNumber: 97,
        examType: 'ENSAYO',
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'B', questionType: 'MULTIPLE_CHOICE', maxPoints: 1, skill: 'Resolver', axis: 'Números', learningObjective: 'OA 1', difficulty: 0.0, guessing: 0.25 },
            { questionNumber: 2, correctAnswer: 'A', questionType: 'MULTIPLE_CHOICE', maxPoints: 1, skill: 'Argumentar', axis: 'Álgebra', learningObjective: 'OA 2', difficulty: 0.0, guessing: 0.25 },
            { questionNumber: 3, correctAnswer: 'DESARROLLO', questionType: 'WRITTEN', maxPoints: 4, skill: 'Modelar', axis: 'Geometría', learningObjective: 'OA 3', difficulty: 0.5, guessing: 0.0 },
            { questionNumber: 4, correctAnswer: 'ORAL', questionType: 'ORAL', maxPoints: 2, skill: 'Comunicar', axis: 'Datos', learningObjective: 'OA 4', difficulty: -0.5, guessing: 0.0 }
          ]
        }
      },
      include: { questions: { orderBy: { questionNumber: 'asc' } } }
    });

    examOther = await prisma.exam.create({
      data: {
        title: 'Otra Prueba Aislada Test',
        subject: 'Lectura',
        level: '6B',
        pdfPath: 'test-recalc-other.pdf',
        optionsCount: 4,
        orderNumber: 98,
        examType: 'ENSAYO',
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'A', questionType: 'MULTIPLE_CHOICE', maxPoints: 1, difficulty: 0.0, guessing: 0.25 }
          ]
        }
      },
      include: { questions: { orderBy: { questionNumber: 'asc' } } }
    });

    const now = new Date();
    assignmentA = await prisma.examAssignment.create({
      data: {
        examId: examMain.id,
        courseId: courseA.id,
        assignedTeacherRut: teacherRut,
        opensAt: new Date(now.getTime() - 2 * 3600 * 1000),
        closesAt: new Date(now.getTime() + 2 * 3600 * 1000),
        status: 'ONGOING'
      }
    });

    assignmentB = await prisma.examAssignment.create({
      data: {
        examId: examMain.id,
        courseId: courseB.id,
        assignedTeacherRut: teacherRut,
        opensAt: new Date(now.getTime() - 2 * 3600 * 1000),
        closesAt: new Date(now.getTime() + 2 * 3600 * 1000),
        status: 'COMPLETED'
      }
    });

    assignmentOther = await prisma.examAssignment.create({
      data: {
        examId: examOther.id,
        courseId: courseA.id,
        assignedTeacherRut: teacherRut,
        opensAt: new Date(now.getTime() - 2 * 3600 * 1000),
        closesAt: new Date(now.getTime() + 2 * 3600 * 1000),
        status: 'COMPLETED'
      }
    });

    const [q1, q2, q3, q4] = examMain.questions;

    // Student 1: responde Q1='C', Q2='D', Q3='Respuesta escrita' (3/4 pts), Q4='' (2/2 pts)
    // Con pauta original (Q1='B', Q2='A') => 0 + 0 + 3 + 2 = 5/8 = 62.5%
    const initialR1 = computeResults(
      examMain.questions,
      { [q1.id]: 'C', [q2.id]: 'D', [q3.id]: 'Mi desarrollo', [q4.id]: '' },
      examMain,
      { [q3.id]: 3, [q4.id]: 2 }
    );
    sub1 = await prisma.submission.create({
      data: {
        studentRut: student1Rut,
        assignmentId: assignmentA.id,
        status: 'SUBMITTED',
        submittedAt: now,
        correctCount: initialR1.correctCount,
        percent: initialR1.percent,
        grade: initialR1.grade,
        achievementLevel: initialR1.achievementLevel,
        simceScore: initialR1.simceScore,
        theta: initialR1.theta,
        seTheta: initialR1.seTheta,
        answers: {
          create: [
            { questionId: q1.id, selectedAnswer: 'C', isCorrect: false },
            { questionId: q2.id, selectedAnswer: 'D', isCorrect: false },
            { questionId: q3.id, selectedAnswer: 'Mi desarrollo', awardedPoints: 3, isCorrect: true },
            { questionId: q4.id, selectedAnswer: '', awardedPoints: 2, isCorrect: true }
          ]
        }
      }
    });

    // Student 2: responde Q1='B', Q2='A', Q3='...' (0/4 pts), Q4 sin calificar (null)
    // Con pauta original (Q1='B', Q2='A') => 1 + 1 + 0 + 0 = 2/8 = 25%
    const initialR2 = computeResults(
      examMain.questions,
      { [q1.id]: 'B', [q2.id]: 'A', [q3.id]: 'Texto corto' },
      examMain,
      { [q3.id]: 0 }
    );
    sub2 = await prisma.submission.create({
      data: {
        studentRut: student2Rut,
        assignmentId: assignmentB.id,
        status: 'SUBMITTED',
        submittedAt: now,
        correctCount: initialR2.correctCount,
        percent: initialR2.percent,
        grade: initialR2.grade,
        achievementLevel: initialR2.achievementLevel,
        simceScore: initialR2.simceScore,
        theta: initialR2.theta,
        seTheta: initialR2.seTheta,
        answers: {
          create: [
            { questionId: q1.id, selectedAnswer: 'B', isCorrect: true },
            { questionId: q2.id, selectedAnswer: 'A', isCorrect: true },
            { questionId: q3.id, selectedAnswer: 'Texto corto', awardedPoints: 0, isCorrect: false },
            { questionId: q4.id, selectedAnswer: '', awardedPoints: null, isCorrect: null }
          ]
        }
      }
    });

    // Student 3: IN_PROGRESS (no debe tocarse al recalcular)
    sub3InProgress = await prisma.submission.create({
      data: {
        studentRut: student3Rut,
        assignmentId: assignmentA.id,
        status: 'IN_PROGRESS',
        answers: {
          create: [
            { questionId: q1.id, selectedAnswer: 'C', isCorrect: null },
            { questionId: q2.id, selectedAnswer: 'D', isCorrect: null }
          ]
        }
      }
    });

    // Otra evaluación completamente independiente (no debe verse afectada)
    const otherQ = examOther.questions[0];
    subOther = await prisma.submission.create({
      data: {
        studentRut: student1Rut,
        assignmentId: assignmentOther.id,
        status: 'SUBMITTED',
        submittedAt: now,
        correctCount: 1,
        percent: 100,
        grade: 7.0,
        achievementLevel: 'ADECUADO',
        simceScore: 340,
        answers: {
          create: [{ questionId: otherQ.id, selectedAnswer: 'A', isCorrect: true }]
        }
      }
    });
  });

  afterAll(async () => {
    for (const aId of [assignmentA?.id, assignmentB?.id, assignmentOther?.id].filter(Boolean)) {
      await prisma.examAssignment.delete({ where: { id: aId } }).catch(() => {});
    }
    for (const eId of [examMain?.id, examOther?.id].filter(Boolean)) {
      await prisma.exam.delete({ where: { id: eId } }).catch(() => {});
    }
    for (const r of [student1Rut, student2Rut, student3Rut, teacherRut]) {
      await prisma.user.delete({ where: { rut: r } }).catch(() => {});
    }
    for (const cId of [courseA?.id, courseB?.id].filter(Boolean)) {
      await prisma.course.delete({ where: { id: cId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test('1. Restringe acceso solo a rol ADMIN y valida parámetros inválidos', async () => {
    const resUnauth = await request(app)
      .post(`/api/admin/exams/${examMain.id}/recalculate-grades`)
      .send({});
    expect(resUnauth.status).toBe(401);

    const resStudent = await request(app)
      .post(`/api/admin/exams/${examMain.id}/recalculate-grades`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(resStudent.status).toBe(403);

    const resTeacher = await request(app)
      .post(`/api/admin/exams/${examMain.id}/recalculate-grades`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({});
    expect(resTeacher.status).toBe(403);

    const resDirector = await request(app)
      .post(`/api/admin/exams/${examMain.id}/recalculate-grades`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({});
    expect(resDirector.status).toBe(403);

    const resInvalid = await request(app)
      .post('/api/admin/exams/no-numerico/recalculate-grades')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(resInvalid.status).toBe(400);

    const resNotFound = await request(app)
      .post('/api/admin/exams/999999/recalculate-grades')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(resNotFound.status).toBe(404);

    const resWrongAssignment = await request(app)
      .post(`/api/admin/exams/${examMain.id}/recalculate-grades`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignmentId: assignmentOther.id });
    expect(resWrongAssignment.status).toBe(400);
  });

  test('2. GET /admin/exams y GET /admin/exams/:id reportan submittedCount e inProgressCount', async () => {
    const listRes = await request(app)
      .get('/api/admin/exams')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const listedMain = listRes.body.find((e) => e.id === examMain.id);
    expect(listedMain).toBeDefined();
    expect(listedMain.submittedCount).toBe(2);

    const detailRes = await request(app)
      .get(`/api/admin/exams/${examMain.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.submittedCount).toBe(2);
    expect(detailRes.body.inProgressCount).toBe(1);
  });

  test('3. Al corregir claves de pauta post-rendición, recalcula SUBMITTED (notas + isCorrect + SIMCE/TRI), respeta desarrollo/IN_PROGRESS y registra auditoría', async () => {
    // Corregir claves: P1 B -> C, P2 A -> D
    const saveKeyRes = await request(app)
      .put(`/api/admin/exams/${examMain.id}/answer-key`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        totalQuestions: 4,
        answerKey: { '1': 'C', '2': 'D', '3': 'DESARROLLO', '4': 'ORAL' },
        questionTypesKeys: { '1': 'MULTIPLE_CHOICE', '2': 'MULTIPLE_CHOICE', '3': 'WRITTEN', '4': 'ORAL' },
        maxPointsKeys: { '1': 1, '2': 1, '3': 4, '4': 2 },
        difficultiesKeys: { '1': '0.0', '2': '0.0', '3': '0.0', '4': '0.0' }
      });
    expect(saveKeyRes.status).toBe(200);

    // Ejecutar recálculo masivo
    const recalcRes = await request(app)
      .post(`/api/admin/exams/${examMain.id}/recalculate-grades`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(recalcRes.status).toBe(200);
    expect(recalcRes.body.examId).toBe(examMain.id);
    expect(recalcRes.body.evaluatedCount).toBe(2);
    expect(recalcRes.body.updatedCount).toBe(2);
    expect(recalcRes.body.updatedGradesCount).toBe(2);
    expect(recalcRes.body.answersUpdatedCount).toBe(4);
    expect(recalcRes.body.assignmentsAffected).toBe(2);

    const updatedExam = await prisma.exam.findUnique({
      where: { id: examMain.id },
      include: { questions: { orderBy: { questionNumber: 'asc' } } }
    });
    const [q1, q2, q3, q4] = updatedExam.questions;

    // Verificar Alumno 1 (subió de 5/8 a 7/8 = 87.5%)
    const expected1 = computeResults(
      updatedExam.questions,
      { [q1.id]: 'C', [q2.id]: 'D', [q3.id]: 'Mi desarrollo', [q4.id]: '' },
      updatedExam,
      { [q3.id]: 3, [q4.id]: 2 }
    );
    const dbSub1 = await prisma.submission.findUnique({
      where: { id: sub1.id },
      include: { answers: true }
    });
    expect(dbSub1.correctCount).toBe(expected1.correctCount);
    expect(dbSub1.percent).toBe(87.5);
    expect(dbSub1.grade).toBe(expected1.grade);
    expect(dbSub1.achievementLevel).toBe('ADECUADO');
    expect(dbSub1.simceScore).toBe(expected1.simceScore);
    expect(dbSub1.theta).toBeCloseTo(expected1.theta, 6);

    const dbSub1Q1 = dbSub1.answers.find((a) => a.questionId === q1.id);
    const dbSub1Q2 = dbSub1.answers.find((a) => a.questionId === q2.id);
    const dbSub1Q3 = dbSub1.answers.find((a) => a.questionId === q3.id);
    const dbSub1Q4 = dbSub1.answers.find((a) => a.questionId === q4.id);
    expect(dbSub1Q1.isCorrect).toBe(true);
    expect(dbSub1Q2.isCorrect).toBe(true);
    expect(dbSub1Q3.awardedPoints).toBe(3);
    expect(dbSub1Q3.isCorrect).toBe(true);
    expect(dbSub1Q4.awardedPoints).toBe(2);
    expect(dbSub1Q4.isCorrect).toBe(true);

    // Verificar Alumno 2 (bajó de 2/8 a 0/8 = 0%)
    const dbSub2 = await prisma.submission.findUnique({
      where: { id: sub2.id },
      include: { answers: true }
    });
    expect(dbSub2.correctCount).toBe(0);
    expect(dbSub2.percent).toBe(0);
    expect(dbSub2.grade).toBe(1.0);
    expect(dbSub2.achievementLevel).toBe('INSUFICIENTE');

    const dbSub2Q1 = dbSub2.answers.find((a) => a.questionId === q1.id);
    const dbSub2Q2 = dbSub2.answers.find((a) => a.questionId === q2.id);
    const dbSub2Q4 = dbSub2.answers.find((a) => a.questionId === q4.id);
    expect(dbSub2Q1.isCorrect).toBe(false);
    expect(dbSub2Q2.isCorrect).toBe(false);
    expect(dbSub2Q4.awardedPoints).toBeNull();
    expect(dbSub2Q4.isCorrect).toBeNull();

    // Verificar Alumno 3 IN_PROGRESS intacto
    const dbSub3 = await prisma.submission.findUnique({
      where: { id: sub3InProgress.id },
      include: { answers: true }
    });
    expect(dbSub3.status).toBe('IN_PROGRESS');
    expect(dbSub3.grade).toBeNull();
    expect(dbSub3.correctCount).toBeNull();
    expect(dbSub3.answers.every((a) => a.isCorrect === null)).toBe(true);

    // Verificar otra prueba completamente aislada
    const dbSubOther = await prisma.submission.findUnique({ where: { id: subOther.id } });
    expect(dbSubOther.grade).toBe(7.0);
    expect(dbSubOther.simceScore).toBe(340);

    // Verificar impacto en análisis por ítem del profesor (/items usa SubmissionAnswer.isCorrect)
    const itemsRes = await request(app)
      .get(`/api/teacher/assignments/${assignmentA.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(itemsRes.status).toBe(200);
    const item1 = itemsRes.body.find((i) => i.questionNumber === 1);
    const item2 = itemsRes.body.find((i) => i.questionNumber === 2);
    expect(item1.correctCount).toBe(1);
    expect(item2.correctCount).toBe(1);

    // Verificar bitácora de auditoría en ambas asignaciones
    const logsA = await prisma.assignmentActionLog.findMany({
      where: { assignmentId: assignmentA.id, action: 'GRADES_RECALCULATED' }
    });
    const logsB = await prisma.assignmentActionLog.findMany({
      where: { assignmentId: assignmentB.id, action: 'GRADES_RECALCULATED' }
    });
    expect(logsA.length).toBe(1);
    expect(logsB.length).toBe(1);
    expect(logsA[0].actorRole).toBe('ADMIN');
    expect(JSON.parse(logsA[0].details).submittedCount).toBe(1);
    expect(JSON.parse(logsB[0].details).submittedCount).toBe(1);
  });

  test('4. Es idempotente y recalcula correctamente si cambia el puntaje máximo de una pregunta abierta o si no hay entregas SUBMITTED', async () => {
    // Segunda llamada sin cambios => 0 actualizaciones
    const idempotentRes = await request(app)
      .post(`/api/admin/exams/${examMain.id}/recalculate-grades`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(idempotentRes.status).toBe(200);
    expect(idempotentRes.body.evaluatedCount).toBe(2);
    expect(idempotentRes.body.updatedCount).toBe(0);
    expect(idempotentRes.body.updatedGradesCount).toBe(0);
    expect(idempotentRes.body.answersUpdatedCount).toBe(0);

    // Reducir puntaje máximo de Q3 WRITTEN de 4 a 2 => Alumno 1 (tiene 3 pts guardados -> acotado a 2) pasa a 6/6 = 100% (7.0)
    await request(app)
      .put(`/api/admin/exams/${examMain.id}/answer-key`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        totalQuestions: 4,
        answerKey: { '1': 'C', '2': 'D', '3': 'DESARROLLO', '4': 'ORAL' },
        questionTypesKeys: { '1': 'MULTIPLE_CHOICE', '2': 'MULTIPLE_CHOICE', '3': 'WRITTEN', '4': 'ORAL' },
        maxPointsKeys: { '1': 1, '2': 1, '3': 2, '4': 2 }
      });

    const ptsRecalcRes = await request(app)
      .post(`/api/admin/exams/${examMain.id}/recalculate-grades`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(ptsRecalcRes.status).toBe(200);
    expect(ptsRecalcRes.body.updatedGradesCount).toBe(1);

    const dbSub1 = await prisma.submission.findUnique({ where: { id: sub1.id } });
    expect(dbSub1.percent).toBe(100);
    expect(dbSub1.grade).toBe(7.0);

    // Evaluación sin entregas SUBMITTED devuelve 200 con evaluatedCount: 0
    const emptyExam = await prisma.exam.create({
      data: {
        title: 'Prueba Vacía Sin Entregas',
        subject: 'Matemática',
        level: '6B',
        pdfPath: 'empty.pdf',
        orderNumber: 99,
        examType: 'ENSAYO',
        questions: {
          create: [{ questionNumber: 1, correctAnswer: 'A', questionType: 'MULTIPLE_CHOICE', maxPoints: 1 }]
        }
      }
    });

    try {
      const emptyRes = await request(app)
        .post(`/api/admin/exams/${emptyExam.id}/recalculate-grades`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(emptyRes.status).toBe(200);
      expect(emptyRes.body.evaluatedCount).toBe(0);
      expect(emptyRes.body.updatedCount).toBe(0);
      expect(emptyRes.body.assignmentsAffected).toBe(0);
    } finally {
      await prisma.exam.delete({ where: { id: emptyExam.id } }).catch(() => {});
    }
  });
});
