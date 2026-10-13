const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcryptjs');

describe('Fase 6 Features: Año Global, Cursos Desglosados, Contraseñas Masivas y Dinámicas', () => {
  const adminToken = signToken({ rut: '11111111-1', role: 'ADMIN', name: 'Administrador' });
  const teacherToken = signToken({ rut: '99999999-9', role: 'TEACHER', name: 'Profesor Jefe' });

  let testCourseId;
  let testAssignmentId;
  const testStudentRut = '12344321-9';

  beforeAll(async () => {
    // Limpiar curso 4M B 2027 si existía de ejecuciones previas
    await prisma.course.deleteMany({
      where: { level: '4M', letter: 'B', year: 2027 }
    });

    // Crear curso de prueba para año 2027
    const c = await prisma.course.upsert({
      where: { level_letter_year: { level: '2M', letter: 'A', year: 2027 } },
      update: {},
      create: { level: '2M', letter: 'A', year: 2027 }
    });
    testCourseId = c.id;

    // Crear profesor de prueba
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

    // Asignar profesor al curso
    await prisma.teacherCourse.upsert({
      where: { teacherRut_courseId: { teacherRut: '99999999-9', courseId: testCourseId } },
      update: {},
      create: { teacherRut: '99999999-9', courseId: testCourseId }
    });

    // Crear alumno de prueba
    const hash = await bcrypt.hash('clave123', 10);
    await prisma.user.upsert({
      where: { rut: testStudentRut },
      update: { courseId: testCourseId, passwordHash: hash },
      create: {
        rut: testStudentRut,
        name: 'Estudiante Prueba Fase 6',
        role: 'STUDENT',
        courseId: testCourseId,
        passwordHash: hash,
        mustChangePassword: true
      }
    });

    // Encontrar o crear un examen y asignación para probar dynamic password
    let exam = await prisma.exam.findFirst();
    if (!exam) {
      exam = await prisma.exam.create({
        data: {
          title: 'Ensayo Prueba Fase 6',
          subject: 'Matematica',
          level: '2M',
          pdfPath: 'test.pdf'
        }
      });
    }

    const now = new Date();
    const opensAt = new Date(now.getTime() - 10 * 60 * 1000); // 10 min atras
    const closesAt = new Date(now.getTime() + 120 * 60 * 1000); // 2 hrs adelante

    const assignment = await prisma.examAssignment.upsert({
      where: { examId_courseId: { examId: exam.id, courseId: testCourseId } },
      update: {
        opensAt,
        closesAt,
        dynamicPassword: 'SIMCE2027',
        dynamicPasswordActive: true
      },
      create: {
        examId: exam.id,
        courseId: testCourseId,
        opensAt,
        closesAt,
        dynamicPassword: 'SIMCE2027',
        dynamicPasswordActive: true
      }
    });
    testAssignmentId = assignment.id;
  });

  test('1. Debería crear un curso desglosado con Nivel, Enseñanza, Letra y Año (POST /api/admin/courses)', async () => {
    const res = await request(app)
      .post('/api/admin/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nivel: '4',
        ensenanza: 'Media',
        letter: 'B',
        year: 2027
      });

    expect(res.status).toBe(200);
    expect(res.body.level).toBe('4M');
    expect(res.body.letter).toBe('B');
    expect(res.body.year).toBe(2027);
  });

  test('2. Debería filtrar cursos por año escolar (GET /api/admin/courses?year=2027)', async () => {
    const res = await request(app)
      .get('/api/admin/courses?year=2027')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every(c => c.year === 2027)).toBe(true);
  });

  test('3. Debería importar cursos desglosados vía CSV de 4 columnas (POST /api/admin/courses/import)', async () => {
    const csvContent = 'Nivel;Enseñanza;Letra;Año\n3;Media;C;2027\n1;Media;A;2027';
    const res = await request(app)
      .post('/api/admin/courses/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(csvContent, 'utf-8'), 'cursos_desglosados.csv');

    expect(res.status).toBe(200);
    expect(res.body.imported).toBeGreaterThanOrEqual(2);

    const c3m = await prisma.course.findFirst({ where: { level: '3M', letter: 'C', year: 2027 } });
    expect(c3m).toBeTruthy();
  });

  test('4. Debería importar alumnos con vinculación a Curso y Año desglosado (POST /api/admin/users/import)', async () => {
    const csvContent = 'RUT;Nombre;Nivel;Enseñanza;Letra;Año;Rol\n98765432-1;Alumno Importado 2027;2;Media;A;2027;STUDENT';
    const res = await request(app)
      .post('/api/admin/users/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(csvContent, 'utf-8'), 'alumnos_con_ano.csv');

    expect(res.status).toBe(200);
    expect(res.body.imported).toBeGreaterThanOrEqual(1);

    const u = await prisma.user.findUnique({
      where: { rut: '98765432-1' },
      include: { course: true }
    });
    expect(u).toBeTruthy();
    expect(u.course.level).toBe('2M');
    expect(u.course.letter).toBe('A');
    expect(u.course.year).toBe(2027);
  });

  test('5. Debería actualizar contraseñas masivas por curso sin exigir cambio de clave (POST /api/admin/users/bulk-password)', async () => {
    const res = await request(app)
      .post('/api/admin/users/bulk-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        courseId: testCourseId,
        newPassword: 'Colegio2027!',
        mustChangePassword: false
      });

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);

    const student = await prisma.user.findUnique({ where: { rut: testStudentRut } });
    expect(student.mustChangePassword).toBe(false);
    const valid = await bcrypt.compare('Colegio2027!', student.passwordHash);
    expect(valid).toBe(true);
  });

  test('6. Debería permitir login de estudiante con contraseña dinámica de ensayo activa si olvidó su clave', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        rut: testStudentRut,
        password: 'SIMCE2027' // Clave dinámica generada por el profesor
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.rut).toBe(testStudentRut);
    expect(res.body.user.mustChangePassword).toBe(false);
    expect(res.body.user.usedDynamicPassword).toBe(true);
  });

  test('7. Debería rechazar login con contraseña dinámica incorrecta', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        rut: testStudentRut,
        password: 'CLAVE_INCORRECTA'
      });

    expect(res.status).toBe(401);
  });

  test('8. Debería gestionar la contraseña dinámica desde endpoint docente (POST /api/teacher/assignments/:id/dynamic-password)', async () => {
    const res = await request(app)
      .post(`/api/teacher/assignments/${testAssignmentId}/dynamic-password`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        dynamicPassword: 'NUEVA-CLAVE',
        dynamicPasswordActive: true
      });

    expect(res.status).toBe(200);
    expect(res.body.dynamicPassword).toBe('NUEVA-CLAVE');
    expect(res.body.dynamicPasswordActive).toBe(true);
  });

  test('9. Debería reagendar y cancelar asignaciones para la vista de calendario', async () => {
    // Reagendar
    const newOpens = new Date(Date.now() + 86400000).toISOString();
    const newCloses = new Date(Date.now() + 172800000).toISOString();
    const resResched = await request(app)
      .patch(`/api/admin/assignments/${testAssignmentId}/reschedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ opensAt: newOpens, closesAt: newCloses, reason: 'Cambio de horario colegio' });

    expect(resResched.status).toBe(200);
    expect(resResched.body.status).toBe('RESCHEDULED');
    expect(resResched.body.originalOpensAt).toBeTruthy();

    // Cancelar
    const resCancel = await request(app)
      .patch(`/api/admin/assignments/${testAssignmentId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Feriado imprevisto' });

    expect(resCancel.status).toBe(200);
    expect(resCancel.body.status).toBe('CANCELLED');
    expect(resCancel.body.cancelReason).toBe('Feriado imprevisto');
  });

  test('10. Debería crear y listar Hitos Oficiales SIMCE (GET y POST /api/admin/milestones)', async () => {
    const resPost = await request(app)
      .post('/api/admin/milestones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'SIMCE Nacional 4° Básico',
        description: 'Evaluación oficial ministerial',
        date: '2027-10-20T09:00:00.000Z',
        level: '4B',
        year: 2027
      });

    expect(resPost.status).toBe(200);
    expect(resPost.body.title).toBe('SIMCE Nacional 4° Básico');
    expect(resPost.body.year).toBe(2027);

    const resGet = await request(app)
      .get('/api/admin/milestones?year=2027')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resGet.status).toBe(200);
    expect(Array.isArray(resGet.body)).toBe(true);
    expect(resGet.body.some(m => m.title === 'SIMCE Nacional 4° Básico')).toBe(true);
  });
});
