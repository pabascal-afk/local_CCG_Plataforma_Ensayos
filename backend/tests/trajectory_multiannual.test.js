const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const request = require('supertest');
const app = require('../src/app');

describe('Fase 7: Filtros de Trayectoria y Trayectoria Multianual', () => {
  const adminToken = signToken({ rut: '11111111-1', role: 'ADMIN', name: 'Administrador' });

  let exam1, exam2, exam3;
  let course2025, course2026;
  let assignment1, assignment2, assignment3;

  beforeAll(async () => {
    // Crear cursos en años 2025 y 2026 para testear multianual
    course2025 = await prisma.course.upsert({
      where: { level_letter_year: { level: '4B', letter: 'A', year: 2025 } },
      update: {},
      create: { level: '4B', letter: 'A', year: 2025 }
    });

    course2026 = await prisma.course.upsert({
      where: { level_letter_year: { level: '4B', letter: 'A', year: 2026 } },
      update: {},
      create: { level: '4B', letter: 'A', year: 2026 }
    });

    // Crear exámenes con diferentes tipos y orderNumbers
    exam1 = await prisma.exam.create({
      data: {
        title: 'Ensayo SIMCE #1 Matemática',
        subject: 'Matematica',
        level: '4B',
        orderNumber: 1,
        examType: 'ENSAYO',
        pdfPath: 'test1.pdf',
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'A', learningObjective: 'OA 1', skill: 'Resolver Problemas' },
            { questionNumber: 2, correctAnswer: 'B', learningObjective: 'OA 2', skill: 'Modelar' }
          ]
        }
      }
    });

    exam2 = await prisma.exam.create({
      data: {
        title: 'Quiz Rápido #2 Matemática',
        subject: 'Matematica',
        level: '4B',
        orderNumber: 2,
        examType: 'QUIZ',
        pdfPath: 'test2.pdf',
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'C', learningObjective: 'OA 1', skill: 'Resolver Problemas' }
          ]
        }
      }
    });

    exam3 = await prisma.exam.create({
      data: {
        title: 'Ensayo SIMCE #3 Lectura',
        subject: 'Lectura',
        level: '4B',
        orderNumber: 3,
        examType: 'ENSAYO',
        pdfPath: 'test3.pdf',
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'D', learningObjective: 'OA 3', skill: 'Localizar Información' }
          ]
        }
      }
    });

    // Asignaciones
    const now = new Date();
    assignment1 = await prisma.examAssignment.create({
      data: {
        examId: exam1.id,
        courseId: course2025.id,
        opensAt: new Date(2025, 3, 10),
        closesAt: new Date(2025, 3, 20)
      }
    });

    assignment2 = await prisma.examAssignment.create({
      data: {
        examId: exam2.id,
        courseId: course2026.id,
        opensAt: new Date(2026, 4, 10),
        closesAt: new Date(2026, 4, 20)
      }
    });

    assignment3 = await prisma.examAssignment.create({
      data: {
        examId: exam3.id,
        courseId: course2026.id,
        opensAt: new Date(2026, 5, 10),
        closesAt: new Date(2026, 5, 20)
      }
    });

    // Submissions
    const studentRut = '11223344-5';
    await prisma.user.upsert({
      where: { rut: studentRut },
      update: { courseId: course2026.id },
      create: {
        rut: studentRut,
        name: 'Alumno Trayectoria',
        role: 'STUDENT',
        courseId: course2026.id,
        passwordHash: 'dummy'
      }
    });

    await prisma.submission.upsert({
      where: { studentRut_assignmentId: { studentRut, assignmentId: assignment1.id } },
      update: {},
      create: {
        studentRut,
        assignmentId: assignment1.id,
        status: 'SUBMITTED',
        simceScore: 260,
        grade: 5.5,
        percent: 75,
        achievementLevel: 'ELEMENTAL'
      }
    });

    await prisma.submission.upsert({
      where: { studentRut_assignmentId: { studentRut, assignmentId: assignment2.id } },
      update: {},
      create: {
        studentRut,
        assignmentId: assignment2.id,
        status: 'SUBMITTED',
        simceScore: 285,
        grade: 6.2,
        percent: 85,
        achievementLevel: 'ADECUADO'
      }
    });

    await prisma.submission.upsert({
      where: { studentRut_assignmentId: { studentRut, assignmentId: assignment3.id } },
      update: {},
      create: {
        studentRut,
        assignmentId: assignment3.id,
        status: 'SUBMITTED',
        simceScore: 290,
        grade: 6.5,
        percent: 90,
        achievementLevel: 'ADECUADO'
      }
    });
  });

  test('1. GET /api/admin/dashboard debería retornar metadatos de filtros y evolución enriquecida', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.filters).toBeDefined();
    expect(res.body.filters.availableSubjects).toContain('Matematica');
    expect(res.body.filters.availableExamTypes).toContain('ENSAYO');
    expect(res.body.filters.availableExamTypes).toContain('QUIZ');
    expect(res.body.filters.availableOrderNumbers).toContain(1);

    expect(res.body.evolution['4B']).toBeDefined();
    const evoList = res.body.evolution['4B'];
    expect(evoList.length).toBeGreaterThanOrEqual(1);
    expect(evoList[0].examType).toBeDefined();
    expect(evoList[0].orderNumber).toBeDefined();
  });

  test('2. GET /api/admin/dashboard debería filtrar por examType y subject', async () => {
    const resQuiz = await request(app)
      .get('/api/admin/dashboard?examType=QUIZ&subject=Matematica')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resQuiz.status).toBe(200);
    const evo = resQuiz.body.evolution['4B'] || [];
    expect(evo.every(e => e.examType === 'QUIZ')).toBe(true);
  });

  test('3. GET /api/admin/dashboard debería filtrar por orderNumbers (ej: 1,3)', async () => {
    const resOrders = await request(app)
      .get('/api/admin/dashboard?orderNumbers=1,3')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resOrders.status).toBe(200);
    const evo = resOrders.body.evolution['4B'] || [];
    expect(evo.every(e => e.orderNumber === 1 || e.orderNumber === 3)).toBe(true);
  });

  test('4. GET /api/admin/dashboard/multiannual debería agrupar por año escolar a través del tiempo', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard/multiannual?level=4B')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.yearly).toBeDefined();
    expect(Array.isArray(res.body.yearly)).toBe(true);
    expect(res.body.yearly.length).toBeGreaterThanOrEqual(2);

    const year2025 = res.body.yearly.find(y => y.year === 2025);
    const year2026 = res.body.yearly.find(y => y.year === 2026);
    expect(year2025).toBeDefined();
    expect(year2026).toBeDefined();
    expect(year2025.avgSimce).toBeGreaterThanOrEqual(250);
    expect(year2026.avgSimce).toBeGreaterThan(0);
  });

  test('5. GET /api/admin/dashboard/multiannual/export.xlsx debería generar archivo Excel multianual', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard/multiannual/export.xlsx?level=4B')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
  });

  test('6. GET /api/teacher/assignments/:id/evolution debería incluir examType, orderNumber y soportar filtros', async () => {
    const teacherToken = signToken({ rut: '99999999-9', role: 'TEACHER', name: 'Profesor Jefe' });
    await prisma.user.upsert({
      where: { rut: '99999999-9' },
      update: { role: 'TEACHER' },
      create: {
        rut: '99999999-9',
        name: 'Profesor Jefe',
        role: 'TEACHER',
        passwordHash: 'testhash'
      }
    });
    await prisma.teacherCourse.upsert({
      where: { teacherRut_courseId: { teacherRut: '99999999-9', courseId: course2026.id } },
      update: {},
      create: { teacherRut: '99999999-9', courseId: course2026.id }
    });

    const res = await request(app)
      .get(`/api/teacher/assignments/${assignment2.id}/evolution?orderNumbers=2`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.timeline).toBeDefined();
    expect(res.body.filters.availableExamTypes).toBeDefined();
    expect(res.body.filters.availableOrderNumbers).toBeDefined();
    expect(res.body.timeline.every(t => t.orderNumber === 2)).toBe(true);
  });
});
