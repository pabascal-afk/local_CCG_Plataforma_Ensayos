require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const auditoria = require('../src/services/auditoria');

describe('Edición de Usuarios por Administrador (PUT /api/admin/users/:rut)', () => {
  const adminRut = '97111111-1';
  const directorRut = '97222222-2';
  const teacherRut = '97333333-3';
  const studentRut = '97444444-4';
  const otherStudentRut = '97555555-5';
  const newRutCandidate = '97666666-6';

  const adminToken = signToken({ rut: adminRut, role: 'ADMIN', name: 'Admin User Edit' });
  const directorToken = signToken({ rut: directorRut, role: 'DIRECTOR', name: 'Director User Edit' });
  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Profesor User Edit' });
  const studentToken = signToken({ rut: studentRut, role: 'STUDENT', name: 'Estudiante User Edit' });

  let courseA;
  let courseB;
  let testExam;
  let testAssignment;
  let testSubmission;

  beforeAll(async () => {
    await auditoria.inicializarTablaAuditoria();
    const hash = await bcrypt.hash('testpass123', 10);

    // 1. Cursos
    courseA = await prisma.course.upsert({
      where: { level_letter_year: { level: '8B', letter: 'K', year: 2097 } },
      update: {},
      create: { level: '8B', letter: 'K', year: 2097 },
    });

    courseB = await prisma.course.upsert({
      where: { level_letter_year: { level: '8B', letter: 'L', year: 2097 } },
      update: {},
      create: { level: '8B', letter: 'L', year: 2097 },
    });

    // 2. Usuarios
    await prisma.user.upsert({
      where: { rut: adminRut },
      update: { name: 'Admin User Edit', role: 'ADMIN', isActive: true, passwordHash: hash },
      create: { rut: adminRut, name: 'Admin User Edit', role: 'ADMIN', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: directorRut },
      update: { name: 'Director User Edit', role: 'DIRECTOR', isActive: true, passwordHash: hash },
      create: { rut: directorRut, name: 'Director User Edit', role: 'DIRECTOR', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: teacherRut },
      update: { name: 'Profesor User Edit', role: 'TEACHER', isActive: true, passwordHash: hash },
      create: { rut: teacherRut, name: 'Profesor User Edit', role: 'TEACHER', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: studentRut },
      update: { name: 'Estudiante User Edit', role: 'STUDENT', courseId: courseA.id, isActive: true, passwordHash: hash },
      create: { rut: studentRut, name: 'Estudiante User Edit', role: 'STUDENT', courseId: courseA.id, passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: otherStudentRut },
      update: { name: 'Otro Alumno Existente', role: 'STUDENT', courseId: courseA.id, isActive: true, passwordHash: hash },
      create: { rut: otherStudentRut, name: 'Otro Alumno Existente', role: 'STUDENT', courseId: courseA.id, passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    // 3. Crear examen y asignación para probar cascada de RUT en entregas
    testExam = await prisma.exam.create({
      data: {
        title: 'Examen Cascada RUT Test',
        subject: 'Lenguaje',
        level: '8B',
        pdfPath: 'cascada.pdf',
        optionsCount: 4,
        orderNumber: 97,
        questions: {
          create: [{ questionNumber: 1, correctAnswer: 'A', questionType: 'MULTIPLE_CHOICE', maxPoints: 1.0 }],
        },
      },
    });

    const now = new Date();
    testAssignment = await prisma.examAssignment.create({
      data: {
        examId: testExam.id,
        courseId: courseA.id,
        assignedTeacherRut: teacherRut,
        opensAt: new Date(now.getTime() - 3600 * 1000),
        closesAt: new Date(now.getTime() + 3600 * 1000),
        status: 'ONGOING',
      },
    });

    testSubmission = await prisma.submission.create({
      data: {
        assignmentId: testAssignment.id,
        studentRut: studentRut,
        status: 'SUBMITTED',
        correctCount: 1,
        percent: 100.0,
        grade: 7.0,
      },
    });

    // 4. Registro de log de asignación para verificar cascada
    await prisma.assignmentActionLog.create({
      data: {
        assignmentId: testAssignment.id,
        action: 'STUDENT_REACTIVATED',
        actorRut: studentRut,
        actorName: 'Estudiante User Edit',
        actorRole: 'STUDENT',
        targetRut: studentRut,
        targetName: 'Estudiante User Edit',
        details: JSON.stringify({ note: 'Test cascade' }),
      },
    });

    // 5. Vincular profesor al curso
    await prisma.teacherCourse.upsert({
      where: { teacherRut_courseId: { teacherRut: teacherRut, courseId: courseA.id } },
      update: {},
      create: { teacherRut: teacherRut, courseId: courseA.id },
    });
  });

  afterAll(async () => {
    await auditoria.flushAuditoria();
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { usuarioId: adminRut },
          { entidadId: studentRut },
          { entidadId: newRutCandidate },
          { entidadId: teacherRut },
          { entidadId: otherStudentRut },
        ],
      },
    }).catch(() => {});

    await prisma.assignmentActionLog.deleteMany({
      where: { assignmentId: testAssignment ? testAssignment.id : -1 },
    }).catch(() => {});

    if (testSubmission) {
      await prisma.submission.deleteMany({ where: { assignmentId: testAssignment.id } }).catch(() => {});
    }

    if (testAssignment) {
      await prisma.examAssignment.delete({ where: { id: testAssignment.id } }).catch(() => {});
    }

    if (testExam) {
      await prisma.exam.delete({ where: { id: testExam.id } }).catch(() => {});
    }

    await prisma.teacherCourse.deleteMany({
      where: { teacherRut: { in: [teacherRut, adminRut, studentRut, newRutCandidate] } },
    }).catch(() => {});

    await prisma.user.deleteMany({
      where: { rut: { in: [adminRut, directorRut, teacherRut, studentRut, otherStudentRut, newRutCandidate] } },
    }).catch(() => {});

    if (courseA) await prisma.course.delete({ where: { id: courseA.id } }).catch(() => {});
    if (courseB) await prisma.course.delete({ where: { id: courseB.id } }).catch(() => {});

    await prisma.$disconnect();
  });

  test('1. PUT /api/admin/users/:rut actualiza nombre, cursoId y estado activo', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${studentRut}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Estudiante Modificado Exitosamente',
        courseId: courseB.id,
        isActive: false,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.rut).toBe(studentRut);
    expect(res.body.name).toBe('Estudiante Modificado Exitosamente');
    expect(res.body.courseId).toBe(courseB.id);
    expect(res.body.isActive).toBe(false);

    // Verificar en BD
    const dbUser = await prisma.user.findUnique({ where: { rut: studentRut } });
    expect(dbUser.name).toBe('Estudiante Modificado Exitosamente');
    expect(dbUser.courseId).toBe(courseB.id);
    expect(dbUser.isActive).toBe(false);
  });

  test('2. PUT /api/admin/users/:rut actualiza RUT y propaga en cascada a Submission y logs', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${studentRut}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        newRut: newRutCandidate,
        name: 'Estudiante Con Nuevo RUT',
        isActive: true,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.rut).toBe(newRutCandidate);
    expect(res.body.name).toBe('Estudiante Con Nuevo RUT');

    // El RUT antiguo ya no debe existir
    const oldUser = await prisma.user.findUnique({ where: { rut: studentRut } });
    expect(oldUser).toBeNull();

    // El nuevo RUT debe existir
    const newUser = await prisma.user.findUnique({ where: { rut: newRutCandidate } });
    expect(newUser).not.toBeNull();
    expect(newUser.rut).toBe(newRutCandidate);

    // La entrega (submission) debe haberse actualizado al nuevo RUT automáticamente
    const sub = await prisma.submission.findFirst({ where: { assignmentId: testAssignment.id } });
    expect(sub.studentRut).toBe(newRutCandidate);

    // El log de asignación debe haberse actualizado
    const actionLogs = await prisma.assignmentActionLog.findMany({ where: { assignmentId: testAssignment.id } });
    expect(actionLogs.length).toBeGreaterThan(0);
    expect(actionLogs[0].actorRut).toBe(newRutCandidate);
    expect(actionLogs[0].targetRut).toBe(newRutCandidate);
  });

  test('3. PUT /api/admin/users/:rut rechaza RUT inválido o nombre vacío con 400', async () => {
    // Nombre vacío
    const resEmptyName = await request(app)
      .put(`/api/admin/users/${newRutCandidate}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '   ' });

    expect(resEmptyName.statusCode).toBe(400);
    expect(resEmptyName.body.error).toMatch(/nombre/i);

    // RUT malformado
    const resBadRut = await request(app)
      .put(`/api/admin/users/${newRutCandidate}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newRut: 'RUT_INVALIDO_TOTALMENTE' });

    expect(resBadRut.statusCode).toBe(400);
    expect(resBadRut.body.error).toMatch(/RUT/i);
  });

  test('4. PUT /api/admin/users/:rut rechaza RUT duplicado con 409', async () => {
    const resDup = await request(app)
      .put(`/api/admin/users/${newRutCandidate}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newRut: otherStudentRut });

    expect(resDup.statusCode).toBe(409);
    expect(resDup.body.error).toMatch(/ya está registrado/i);
  });

  test('5. PUT /api/admin/users/:rut resetea contraseña a los 6 dígitos del RUT', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${newRutCandidate}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resetPassword: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);

    const userInDb = await prisma.user.findUnique({ where: { rut: newRutCandidate } });
    expect(userInDb.mustChangePassword).toBe(true);

    const expectedSixDigits = newRutCandidate.split('-')[0].slice(0, 6); // '976666'
    const passwordMatches = await bcrypt.compare(expectedSixDigits, userInDb.passwordHash);
    expect(passwordMatches).toBe(true);
  });

  test('6. PUT /api/admin/users/:rut establece contraseña personalizada y flag mustChangePassword', async () => {
    const customPass = 'ColegioCCG2026!';
    const res = await request(app)
      .put(`/api/admin/users/${newRutCandidate}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        password: customPass,
        mustChangePassword: false,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.mustChangePassword).toBe(false);

    const userInDb = await prisma.user.findUnique({ where: { rut: newRutCandidate } });
    expect(userInDb.mustChangePassword).toBe(false);
    const passwordMatches = await bcrypt.compare(customPass, userInDb.passwordHash);
    expect(passwordMatches).toBe(true);
  });

  test('7. Cambio de rol limpia asignaciones incompatibles (cursoId / TeacherCourse)', async () => {
    // Pasar un profesor a STUDENT
    const resProfToStudent = await request(app)
      .put(`/api/admin/users/${teacherRut}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        role: 'STUDENT',
        courseId: courseA.id,
      });

    expect(resProfToStudent.statusCode).toBe(200);
    expect(resProfToStudent.body.role).toBe('STUDENT');
    expect(resProfToStudent.body.courseId).toBe(courseA.id);

    // Comprobar que se eliminó de TeacherCourse
    const tcCount = await prisma.teacherCourse.count({ where: { teacherRut: teacherRut } });
    expect(tcCount).toBe(0);

    // Ahora pasar ese usuario a ADMIN: debe limpiar courseId a null
    const resStudentToAdmin = await request(app)
      .put(`/api/admin/users/${teacherRut}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        role: 'ADMIN',
      });

    expect(resStudentToAdmin.statusCode).toBe(200);
    expect(resStudentToAdmin.body.role).toBe('ADMIN');
    expect(resStudentToAdmin.body.courseId).toBeNull();
  });

  test('8. Control de acceso RBAC: usuarios no admin reciben 403', async () => {
    // DIRECTOR intenta editar usuario
    const resDirector = await request(app)
      .put(`/api/admin/users/${newRutCandidate}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ name: 'Hack Name' });
    expect(resDirector.statusCode).toBe(403);

    // STUDENT intenta editar usuario
    const resStudent = await request(app)
      .put(`/api/admin/users/${newRutCandidate}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ name: 'Hack Name' });
    expect(resStudent.statusCode).toBe(403);
  });

  test('9. Registra evento detallado en la tabla de auditoría (logs_auditoria)', async () => {
    await auditoria.flushAuditoria();

    const auditResult = await auditoria.consultarLogs({
      modulo: 'Usuarios',
      limit: 10,
    });

    expect(auditResult.items.length).toBeGreaterThan(0);
    const userLog = auditResult.items.find((l) => l.entidad === 'Usuario');
    expect(userLog).toBeDefined();
    expect(userLog.modulo).toBe('Usuarios');
    expect(userLog.usuario_id).toBe(adminRut);
  });
});
