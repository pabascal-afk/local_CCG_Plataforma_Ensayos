const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const request = require('supertest');
const app = require('../src/app');

describe('Flujo Híbrido de Remediales, Aprobación UTP y Aislamiento de Métricas', () => {
  const adminToken = signToken({ rut: '11111111-1', role: 'ADMIN', name: 'Administrador UTP' });
  const teacherRut = '15555555-6';
  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Profesor de Matemática' });

  let originAssignment;
  let remedialExam;
  let testCourse;
  let proposalId;

  beforeAll(async () => {
    // 1. Obtener curso existente o crear uno
    testCourse = await prisma.course.findFirst({
      where: { level: '4B', letter: 'A', year: 2026 }
    });
    if (!testCourse) {
      testCourse = await prisma.course.create({
        data: { level: '4B', letter: 'A', year: 2026 }
      });
    }

    // 2. Asegurar que el docente está vinculado al curso
    await prisma.user.upsert({
      where: { rut: teacherRut },
      update: { role: 'TEACHER' },
      create: {
        rut: teacherRut,
        name: 'Profesor de Matemática',
        role: 'TEACHER',
        passwordHash: 'dummy'
      }
    });

    await prisma.teacherCourse.upsert({
      where: { teacherRut_courseId: { teacherRut, courseId: testCourse.id } },
      update: {},
      create: { teacherRut, courseId: testCourse.id }
    });

    // 3. Crear examen de origen
    const examOrigin = await prisma.exam.create({
      data: {
        title: 'Ensayo SIMCE Matemática Test Remedial',
        subject: 'Matematica',
        level: '4B',
        orderNumber: 99,
        examType: 'ENSAYO',
        pdfPath: 'test_origin.pdf',
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'A', learningObjective: 'OA 4', skill: 'Resolver' },
            { questionNumber: 2, correctAnswer: 'B', learningObjective: 'OA 4', skill: 'Resolver' }
          ]
        }
      },
      include: { questions: true }
    });

    // 4. Crear examen remedial
    remedialExam = await prisma.exam.create({
      data: {
        title: 'Remedial Matemática Test #1',
        subject: 'Matematica',
        level: '4B',
        orderNumber: 1,
        examType: 'REMEDIAL',
        pdfPath: 'test_remedial.pdf',
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'A', learningObjective: 'OA 4', skill: 'Resolver' }
          ]
        }
      },
      include: { questions: true }
    });

    // 5. Crear asignación de origen rendida
    originAssignment = await prisma.examAssignment.create({
      data: {
        examId: examOrigin.id,
        courseId: testCourse.id,
        assignedTeacherRut: teacherRut,
        opensAt: new Date(Date.now() - 3600000 * 24),
        closesAt: new Date(Date.now() - 3600000 * 20),
        status: 'COMPLETED'
      }
    });

    // Crear un estudiante y una entrega para que conste como rendido
    const studentUser = await prisma.user.upsert({
      where: { rut: '22222222-2' },
      update: { courseId: testCourse.id },
      create: {
        rut: '22222222-2',
        name: 'Estudiante Test',
        role: 'STUDENT',
        courseId: testCourse.id,
        passwordHash: 'hash'
      }
    });

    await prisma.submission.create({
      data: {
        studentRut: studentUser.rut,
        assignmentId: originAssignment.id,
        status: 'SUBMITTED',
        percent: 40,
        simceScore: 230,
        grade: 3.5,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: examOrigin.questions[0].id, selectedAnswer: 'B', isCorrect: false }
          ]
        }
      }
    });
  });

  test('1. GET /api/teacher/assignments/:id/remedial debería alertar si el ensayo rendido no tiene remedial', async () => {
    const res = await request(app)
      .get(`/api/teacher/assignments/${originAssignment.id}/remedial`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hasSubmissions).toBe(true);
    expect(res.body.alertNoRemedial).toBe(true);
    expect(Array.isArray(res.body.availableRemedialExams)).toBe(true);
  });

  test('2. POST /api/teacher/assignments/:id/propose-remedial guarda propuesta en PENDING', async () => {
    const res = await request(app)
      .post(`/api/teacher/assignments/${originAssignment.id}/propose-remedial`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        remedialExamId: remedialExam.id,
        suggestedDate: new Date().toISOString(),
        startTime: '08:30',
        endTime: '10:00',
        notes: 'Reforzamiento urgente de OA 4 tras descenso en ensayo.'
      });

    expect(res.status).toBe(200);
    expect(res.body.proposal).toBeDefined();
    expect(res.body.proposal.status).toBe('PENDING');
    expect(res.body.proposal.remedialExamId).toBe(remedialExam.id);
    proposalId = res.body.proposal.id;
  });

  test('3. GET /api/admin/remedial-proposals lista la propuesta para UTP', async () => {
    const res = await request(app)
      .get('/api/admin/remedial-proposals')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(p => p.id === proposalId);
    expect(found).toBeDefined();
    expect(found.teacher.rut).toBe(teacherRut);
    expect(found.status).toBe('PENDING');
  });

  test('4. PATCH /api/admin/remedial-proposals/:id/approve aprueba y crea la asignación formal', async () => {
    const res = await request(app)
      .patch(`/api/admin/remedial-proposals/${proposalId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reviewNotes: 'Aprobado formalmente por Jefatura Técnica UTP'
      });

    expect(res.status).toBe(200);
    expect(res.body.proposal.status).toBe('APPROVED');
    expect(res.body.createdAssignment).toBeDefined();
    expect(res.body.createdAssignment.remedialOriginId).toBe(originAssignment.id);
    expect(res.body.createdAssignment.courseId).toBe(testCourse.id);
  });

  test('5. GET /api/admin/remedial-alerts excluye el ensayo que ya tiene acción aprobada', async () => {
    const res = await request(app)
      .get('/api/admin/remedial-alerts?year=2026')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.alerts).toBeDefined();
    const alertFound = res.body.alerts.find(a => a.assignmentId === originAssignment.id);
    expect(alertFound).toBeUndefined(); // Ya no está en alerta porque fue aprobada
  });

  test('6. PATCH /api/admin/remedial-proposals/:id/reject rechaza con motivo pedagógico', async () => {
    // Crear una segunda propuesta para probar el rechazo
    const p2 = await prisma.remedialProposal.create({
      data: {
        originAssignmentId: originAssignment.id,
        courseId: testCourse.id,
        teacherRut,
        suggestedDate: new Date(),
        status: 'PENDING'
      }
    });

    const res = await request(app)
      .patch(`/api/admin/remedial-proposals/${p2.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Fecha coincide con acto cívico del colegio'
      });

    expect(res.status).toBe(200);
    expect(res.body.proposal.status).toBe('REJECTED');
    expect(res.body.proposal.reviewNotes).toContain('acto cívico');
  });

  test('7. GET /api/teacher/assignments/:id/remedial-impact compara OA antes y después', async () => {
    const res = await request(app)
      .get(`/api/teacher/assignments/${originAssignment.id}/remedial-impact`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hasRemedial).toBe(true);
    expect(Array.isArray(res.body.comparison)).toBe(true);
  });
});
