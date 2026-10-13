const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');

describe('Pruebas de Asignación y Workbench (Filtros, Duración, PIN)', () => {
  const adminRut = '11111111-1';
  const adminToken = signToken({ rut: adminRut, role: 'ADMIN', name: 'Administrador' });

  let testCourse;
  let testExam;
  let testTeacher;

  beforeAll(async () => {
    // 1. Asegurar admin
    await prisma.user.upsert({
      where: { rut: adminRut },
      update: { role: 'ADMIN' },
      create: {
        rut: adminRut,
        name: 'Administrador Pruebas',
        role: 'ADMIN',
        passwordHash: 'dummy'
      }
    });

    // 2. Crear profesor
    testTeacher = await prisma.user.upsert({
      where: { rut: '22222222-2' },
      update: { role: 'TEACHER', name: 'Profesor Titular' },
      create: {
        rut: '22222222-2',
        name: 'Profesor Titular',
        role: 'TEACHER',
        passwordHash: 'dummy'
      }
    });

    // 3. Crear curso de prueba
    testCourse = await prisma.course.upsert({
      where: { level_letter_year: { level: '4B', letter: 'Z', year: 2026 } },
      update: {},
      create: { level: '4B', letter: 'Z', year: 2026 }
    });

    // 4. Crear examen de prueba
    testExam = await prisma.exam.create({
      data: {
        title: 'Ensayo Diagnóstico Workbench Test',
        subject: 'Matematica',
        level: '4B',
        pdfPath: 'test.pdf',
        durationMinutes: 90,
        examType: 'DIAGNOSTICO',
        orderNumber: 99
      }
    });
  });

  afterAll(async () => {
    // Limpieza
    try {
      if (testExam) {
        await prisma.examAssignment.deleteMany({
          where: { examId: testExam.id }
        });
        await prisma.exam.delete({
          where: { id: testExam.id }
        });
      }
      if (testCourse) {
        await prisma.course.delete({
          where: { id: testCourse.id }
        });
      }
    } catch (e) {
      // Ignorar errores de limpieza
    }
  });

  test('POST /admin/assignments crea una asignación con duración personalizada, profesor y PIN dinámico', async () => {
    const res = await request(app)
      .post('/api/admin/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        examId: testExam.id,
        courseId: testCourse.id,
        opensAt: '2026-10-15T08:00:00.000Z',
        closesAt: '2026-10-15T18:00:00.000Z',
        durationMinutes: 60,
        assignedTeacherRut: testTeacher.rut,
        dynamicPassword: 'simce4bz',
        dynamicPasswordActive: true
      });

    expect(res.status).toBe(200);
    expect(res.body.examId).toBe(testExam.id);
    expect(res.body.courseId).toBe(testCourse.id);
    expect(res.body.assignedTeacherRut).toBe(testTeacher.rut);
    expect(res.body.dynamicPassword).toBe('SIMCE4BZ');
    expect(res.body.dynamicPasswordActive).toBe(true);

    // Comprobar que el examen actualizó su duración a 60 minutos
    const updatedExam = await prisma.exam.findUnique({
      where: { id: testExam.id }
    });
    expect(updatedExam.durationMinutes).toBe(60);
  });

  test('GET /admin/assignments lista la asignación con duración, docente y PIN', async () => {
    const res = await request(app)
      .get(`/api/admin/assignments?year=2026`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const found = res.body.find(a => a.examId === testExam.id && a.courseId === testCourse.id);
    expect(found).toBeDefined();
    expect(found.dynamicPassword).toBe('SIMCE4BZ');
    expect(found.dynamicPasswordActive).toBe(true);
    expect(found.durationMinutes).toBe(60);
    expect(found.assignedTeacher.rut).toBe(testTeacher.rut);
  });
});
