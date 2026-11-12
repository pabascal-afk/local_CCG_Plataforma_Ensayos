require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const auditoria = require('../src/services/auditoria');

describe('Edición de Tipo / Tag de Evaluación (examType)', () => {
  const adminRut = '96111111-1';
  const directorRut = '96222222-2';
  const teacherRut = '96333333-3';
  const studentRut = '96444444-4';

  const adminToken = signToken({ rut: adminRut, role: 'ADMIN', name: 'Admin Tag Test' });
  const directorToken = signToken({ rut: directorRut, role: 'DIRECTOR', name: 'Director Tag Test' });
  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Docente Tag Test' });
  const studentToken = signToken({ rut: studentRut, role: 'STUDENT', name: 'Estudiante Tag Test' });

  let exam;
  let courseA;
  let courseB;
  let assignment;
  let assignmentB;
  let studentUser;

  beforeAll(async () => {
    await auditoria.inicializarTablaAuditoria();
    const hash = await bcrypt.hash('tagtest1234', 10);

    courseA = await prisma.course.upsert({
      where: { level_letter_year: { level: '6B', letter: 'Y', year: 2096 } },
      update: {},
      create: { level: '6B', letter: 'Y', year: 2096 },
    });

    courseB = await prisma.course.upsert({
      where: { level_letter_year: { level: '7B', letter: 'Z', year: 2096 } },
      update: {},
      create: { level: '7B', letter: 'Z', year: 2096 },
    });

    await prisma.user.upsert({
      where: { rut: adminRut },
      update: { name: 'Admin Tag Test', role: 'ADMIN', isActive: true, passwordHash: hash },
      create: { rut: adminRut, name: 'Admin Tag Test', role: 'ADMIN', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    studentUser = await prisma.user.upsert({
      where: { rut: studentRut },
      update: { name: 'Estudiante Tag Test', role: 'STUDENT', courseId: courseB.id, isActive: true, passwordHash: hash },
      create: { rut: studentRut, name: 'Estudiante Tag Test', role: 'STUDENT', courseId: courseB.id, passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    exam = await prisma.exam.create({
      data: {
        title: 'Evaluación Cambio Tag E2E',
        subject: 'Matemática',
        level: '6B',
        pdfPath: 'tag-test.pdf',
        optionsCount: 4,
        orderNumber: 92,
        examType: 'ENSAYO',
        gradingMode: 'NORMAL',
        passThreshold: 0.6,
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'C', questionType: 'MULTIPLE_CHOICE', maxPoints: 2.0, difficulty: 0.0, guessing: 0.25 },
            { questionNumber: 2, correctAnswer: 'DESARROLLO', questionType: 'WRITTEN', maxPoints: 5.0, difficulty: 0.0, guessing: 0.0 },
          ],
        },
      },
      include: { questions: true },
    });

    const now = new Date();
    assignment = await prisma.examAssignment.create({
      data: {
        examId: exam.id,
        courseId: courseA.id,
        opensAt: new Date(now.getTime() - 3600 * 1000),
        closesAt: new Date(now.getTime() + 3600 * 1000),
        status: 'ONGOING',
      },
    });
  });

  afterAll(async () => {
    await auditoria.flushAuditoria();
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { usuarioId: adminRut },
          { entidadId: exam ? String(exam.id) : undefined },
          { entidadId: assignment ? String(assignment.id) : undefined },
          { entidadId: assignmentB ? String(assignmentB.id) : undefined },
        ].filter((c) => c.usuarioId || c.entidadId),
      },
    }).catch(() => {});
    if (exam) {
      await prisma.exam.delete({ where: { id: exam.id } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { rut: { in: [adminRut, studentRut] } } }).catch(() => {});
    if (courseA) await prisma.course.delete({ where: { id: courseA.id } }).catch(() => {});
    if (courseB) await prisma.course.delete({ where: { id: courseB.id } }).catch(() => {});
    await prisma.$disconnect();
  });

  test('1. PUT /api/admin/exams/:id cambia examType, normaliza mayúsculas/espacios y preserva preguntas y config', async () => {
    const res = await request(app)
      .put(`/api/admin/exams/${exam.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ examType: '  prueba_unidad  ' });

    expect(res.statusCode).toBe(200);
    expect(res.body.examType).toBe('PRUEBA_UNIDAD');
    expect(res.body.title).toBe('Evaluación Cambio Tag E2E');
    expect(res.body.subject).toBe('Matemática');
    expect(res.body.gradingMode).toBe('NORMAL');
    expect(res.body.totalMaxPoints).toBe(7);

    const detailRes = await request(app)
      .get(`/api/admin/exams/${exam.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.body.examType).toBe('PRUEBA_UNIDAD');
    expect(detailRes.body.answerKey['1']).toBe('C');
    expect(detailRes.body.maxPointsKeys['1']).toBe(2);
    expect(detailRes.body.maxPointsKeys['2']).toBe(5);
  });

  test('2. Permite cambiar entre todos los tags válidos (CONOCIMIENTOS_GENERALES, DIAGNOSTICO, REMEDIAL, QUIZ, ENSAYO_LARGO, ENSAYO)', async () => {
    const tags = ['CONOCIMIENTOS_GENERALES', 'DIAGNOSTICO', 'REMEDIAL', 'QUIZ', 'ENSAYO_LARGO', 'ENSAYO'];
    for (const tag of tags) {
      const res = await request(app)
        .put(`/api/admin/exams/${exam.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ examType: tag });
      expect(res.statusCode).toBe(200);
      expect(res.body.examType).toBe(tag);
    }

    const catalogRes = await request(app)
      .get('/api/admin/exams')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(catalogRes.statusCode).toBe(200);
    const found = catalogRes.body.find((e) => e.id === exam.id);
    expect(found).toBeDefined();
    expect(found.examType).toBe('ENSAYO');
  });

  test('3. PUT /api/admin/exams/:id rechaza examType vacío o inválido con 400', async () => {
    const emptyRes = await request(app)
      .put(`/api/admin/exams/${exam.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ examType: '   ' });
    expect(emptyRes.statusCode).toBe(400);

    const invalidRes = await request(app)
      .put(`/api/admin/exams/${exam.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ examType: 'TAG_INEXISTENTE' });
    expect(invalidRes.statusCode).toBe(400);
  });

  test('4. PUT /api/admin/exams/:id/answer-key también soporta actualizar examType y valida inválidos', async () => {
    const badRes = await request(app)
      .put(`/api/admin/exams/${exam.id}/answer-key`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        totalQuestions: 2,
        examType: 'INVALIDO',
        answerKey: { '1': 'C', '2': 'DESARROLLO' },
      });
    expect(badRes.statusCode).toBe(400);

    const okRes = await request(app)
      .put(`/api/admin/exams/${exam.id}/answer-key`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        totalQuestions: 2,
        examType: 'DIAGNOSTICO',
        gradingMode: 'NORMAL',
        passThresholdPercent: 60,
        answerKey: { '1': 'C', '2': 'DESARROLLO' },
        questionTypesKeys: { '1': 'MULTIPLE_CHOICE', '2': 'WRITTEN' },
        maxPointsKeys: { '1': 2, '2': 5 },
      });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.body.examType).toBe('DIAGNOSTICO');
  });

  test('5. RBAC: DIRECTOR, TEACHER y STUDENT reciben 403 al intentar cambiar examType', async () => {
    for (const tok of [directorToken, teacherToken, studentToken]) {
      const res = await request(app)
        .put(`/api/admin/exams/${exam.id}`)
        .set('Authorization', `Bearer ${tok}`)
        .send({ examType: 'QUIZ' });
      expect(res.statusCode).toBe(403);
    }
  });

  test('6. Auditoría registra previousExamType y newExamType en logs_auditoria', async () => {
    await request(app)
      .put(`/api/admin/exams/${exam.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ examType: 'REMEDIAL' });

    await auditoria.flushAuditoria();

    const logs = await prisma.auditLog.findMany({
      where: { entidadId: String(exam.id), accion: 'Modificar' },
      orderBy: { id: 'desc' },
    });
    expect(logs.length).toBeGreaterThan(0);
    const latest = logs[0];
    expect(latest.descripcion).toContain('DIAGNOSTICO → REMEDIAL');
    const detalles = JSON.parse(latest.detalles);
    expect(detalles.previousExamType).toBe('DIAGNOSTICO');
    expect(detalles.newExamType).toBe('REMEDIAL');
  });

  test('7. PUT /api/admin/exams/:id y answer-key permiten cambiar level (nivel/curso base) y rechazan inválidos', async () => {
    const badRes = await request(app)
      .put(`/api/admin/exams/${exam.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ level: '9Z' });
    expect(badRes.statusCode).toBe(400);

    const res = await request(app)
      .put(`/api/admin/exams/${exam.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ level: ' 2m ' });
    expect(res.statusCode).toBe(200);
    expect(res.body.level).toBe('2M');

    const akRes = await request(app)
      .put(`/api/admin/exams/${exam.id}/answer-key`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        totalQuestions: 2,
        level: '8B',
        answerKey: { '1': 'C', '2': 'DESARROLLO' },
        questionTypesKeys: { '1': 'MULTIPLE_CHOICE', '2': 'WRITTEN' },
        maxPointsKeys: { '1': 2, '2': 5 },
      });
    expect(akRes.statusCode).toBe(200);
    expect(akRes.body.level).toBe('8B');
  });

  test('8. PATCH /api/admin/assignments/:id/course mueve una asignación sin entregas a otro curso y registra auditoría', async () => {
    const catRes = await request(app)
      .get('/api/admin/exams')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(catRes.statusCode).toBe(200);
    const catalogExam = catRes.body.find((e) => e.id === exam.id);
    expect(catalogExam.assignedCourses[0].assignmentId).toBe(assignment.id);

    const moveRes = await request(app)
      .patch(`/api/admin/assignments/${assignment.id}/course`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseId: courseB.id });

    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.body.courseId).toBe(courseB.id);
    expect(moveRes.body.Course.id).toBe(courseB.id);

    const actionLogs = await prisma.assignmentActionLog.findMany({
      where: { assignmentId: assignment.id, action: 'COURSE_CHANGED' },
    });
    expect(actionLogs.length).toBeGreaterThan(0);

    await auditoria.flushAuditoria();
    const globalLogs = await prisma.auditLog.findMany({
      where: { entidadId: String(assignment.id), accion: 'Cambiar Curso' },
    });
    expect(globalLogs.length).toBeGreaterThan(0);
  });

  test('9. PATCH /api/admin/assignments/:id/course rechaza mover a un curso donde la evaluación ya está asignada (409)', async () => {
    const now = new Date();
    assignmentB = await prisma.examAssignment.create({
      data: {
        examId: exam.id,
        courseId: courseA.id,
        opensAt: new Date(now.getTime() - 3600 * 1000),
        closesAt: new Date(now.getTime() + 3600 * 1000),
        status: 'ONGOING',
      },
    });

    const conflictRes = await request(app)
      .patch(`/api/admin/assignments/${assignmentB.id}/course`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseId: courseB.id });

    expect(conflictRes.statusCode).toBe(409);
  });

  test('10. PATCH /api/admin/assignments/:id/course impide cambiar curso si ya existen intentos/entregas de estudiantes (409)', async () => {
    await prisma.submission.create({
      data: {
        studentRut: studentUser.rut,
        assignmentId: assignment.id,
        status: 'IN_PROGRESS',
      },
    });

    const blockedRes = await request(app)
      .patch(`/api/admin/assignments/${assignment.id}/course`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseId: courseA.id });

    expect(blockedRes.statusCode).toBe(409);
    expect(blockedRes.body.error).toContain('intento');
  });

  test('11. RBAC: DIRECTOR, TEACHER y STUDENT reciben 403 al cambiar curso de una asignación', async () => {
    for (const tok of [directorToken, teacherToken, studentToken]) {
      const res = await request(app)
        .patch(`/api/admin/assignments/${assignment.id}/course`)
        .set('Authorization', `Bearer ${tok}`)
        .send({ courseId: courseA.id });
      expect(res.statusCode).toBe(403);
    }
  });
});
