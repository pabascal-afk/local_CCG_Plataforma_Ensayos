require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const auditoria = require('../src/services/auditoria');

describe('Edición de Cursos por Administrador (PUT /api/admin/courses/:id)', () => {
  const adminRut = '96111111-1';
  const directorRut = '96222222-2';
  const teacherRut = '96333333-3';
  const studentRut = '96444444-4';

  const adminToken = signToken({ rut: adminRut, role: 'ADMIN', name: 'Admin Course Edit' });
  const directorToken = signToken({ rut: directorRut, role: 'DIRECTOR', name: 'Director Course Edit' });
  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Profesor Course Edit' });

  let courseMain;
  let courseDuplicate;

  beforeAll(async () => {
    await auditoria.inicializarTablaAuditoria();
    const hash = await bcrypt.hash('testpass123', 10);

    await prisma.user.upsert({
      where: { rut: adminRut },
      update: { name: 'Admin Course Edit', role: 'ADMIN', isActive: true, passwordHash: hash },
      create: { rut: adminRut, name: 'Admin Course Edit', role: 'ADMIN', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: directorRut },
      update: { name: 'Director Course Edit', role: 'DIRECTOR', isActive: true, passwordHash: hash },
      create: { rut: directorRut, name: 'Director Course Edit', role: 'DIRECTOR', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: teacherRut },
      update: { name: 'Profesor Course Edit', role: 'TEACHER', isActive: true, passwordHash: hash },
      create: { rut: teacherRut, name: 'Profesor Course Edit', role: 'TEACHER', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    // Limpiar posibles residuos de ejecuciones abortadas
    await prisma.user.deleteMany({ where: { rut: studentRut } }).catch(() => {});
    await prisma.course.deleteMany({ where: { year: 2096 } }).catch(() => {});

    courseMain = await prisma.course.create({
      data: { level: '5B', letter: 'A', year: 2096 },
    });

    courseDuplicate = await prisma.course.create({
      data: { level: '2M', letter: 'B', year: 2096 },
    });

    await prisma.user.create({
      data: {
        rut: studentRut,
        name: 'Estudiante Curso Edit',
        role: 'STUDENT',
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true,
        courseId: courseMain.id,
      },
    });
  });

  afterAll(async () => {
    await auditoria.flushAuditoria();
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { usuarioId: adminRut },
          { entidadId: String(courseMain ? courseMain.id : -1) },
          { entidadId: String(courseDuplicate ? courseDuplicate.id : -1) },
        ],
      },
    }).catch(() => {});

    await prisma.user.deleteMany({
      where: { rut: { in: [adminRut, directorRut, teacherRut, studentRut] } },
    }).catch(() => {});

    await prisma.course.deleteMany({
      where: { year: 2096 },
    }).catch(() => {});

    await prisma.$disconnect();
  });

  test('1. PUT /api/admin/courses/:id actualiza con formato desglosado y preserva estudiantes vinculados', async () => {
    const res = await request(app)
      .put(`/api/admin/courses/${courseMain.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nivel: '6',
        ensenanza: 'Básica',
        letter: 'C',
        year: 2096,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(courseMain.id);
    expect(res.body.level).toBe('6B');
    expect(res.body.letter).toBe('C');
    expect(res.body.year).toBe(2096);
    expect(res.body._count.students).toBe(1);

    const dbStudent = await prisma.user.findUnique({
      where: { rut: studentRut },
      include: { course: true },
    });
    expect(dbStudent.courseId).toBe(courseMain.id);
    expect(dbStudent.course.level).toBe('6B');
    expect(dbStudent.course.letter).toBe('C');

    await auditoria.flushAuditoria();
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        modulo: 'Cursos',
        accion: 'Modificar',
        entidadId: String(courseMain.id),
      },
      orderBy: { fechaHora: 'desc' },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry.descripcion).toContain('5B A (2096)');
    expect(auditEntry.descripcion).toContain('6B C (2096)');
  });

  test('2. PUT /api/admin/courses/:id acepta formato directo { level, letter } con identificador multi-carácter', async () => {
    const res = await request(app)
      .put(`/api/admin/courses/${courseMain.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        level: ' 3m ',
        letter: ' hc ',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.level).toBe('3M');
    expect(res.body.letter).toBe('HC');
    expect(res.body.year).toBe(2096);
  });

  test('3. Rechaza actualización si genera curso duplicado [level, letter, year] (HTTP 400)', async () => {
    const res = await request(app)
      .put(`/api/admin/courses/${courseMain.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        level: '2M',
        letter: 'B',
        year: 2096,
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Ya existe otro curso/i);
  });

  test('4. Valida entradas inválidas y curso inexistente', async () => {
    const emptyLetter = await request(app)
      .put(`/api/admin/courses/${courseMain.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ letter: '   ' });
    expect(emptyLetter.statusCode).toBe(400);

    const badLevel = await request(app)
      .put(`/api/admin/courses/${courseMain.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ level: '9M' });
    expect(badLevel.statusCode).toBe(400);

    const notFound = await request(app)
      .put('/api/admin/courses/9999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ letter: 'Z' });
    expect(notFound.statusCode).toBe(404);
  });

  test('5. Control de acceso RBAC: DIRECTOR y TEACHER reciben 403', async () => {
    const dirRes = await request(app)
      .put(`/api/admin/courses/${courseMain.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ letter: 'D' });
    expect(dirRes.statusCode).toBe(403);

    const teachRes = await request(app)
      .put(`/api/admin/courses/${courseMain.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ letter: 'D' });
    expect(teachRes.statusCode).toBe(403);
  });
});
