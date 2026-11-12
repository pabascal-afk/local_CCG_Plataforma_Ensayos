require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const auditoria = require('../src/services/auditoria');

describe('Sistema centralizado de Auditoría y Logs (logs_auditoria)', () => {
  const adminRut = '91111111-1';
  const directorRut = '92222222-2';
  const teacherRut = '93333333-3';
  const studentRut = '94444444-4';

  const adminToken = signToken({ rut: adminRut, role: 'ADMIN', name: 'Admin Auditoria Test' });
  const directorToken = signToken({ rut: directorRut, role: 'DIRECTOR', name: 'Director Auditoria Test' });
  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Docente Auditoria Test' });
  const studentToken = signToken({ rut: studentRut, role: 'STUDENT', name: 'Estudiante Auditoria Test' });

  const createdLogIds = [];
  let course;
  let exam;
  let assignment;

  beforeAll(async () => {
    await auditoria.inicializarTablaAuditoria();
    const hash = await bcrypt.hash('audit1234', 10);

    course = await prisma.course.upsert({
      where: { level_letter_year: { level: '8B', letter: 'W', year: 2097 } },
      update: {},
      create: { level: '8B', letter: 'W', year: 2097 },
    });

    await prisma.user.upsert({
      where: { rut: adminRut },
      update: { name: 'Admin Auditoria Test', role: 'ADMIN', isActive: true, passwordHash: hash },
      create: { rut: adminRut, name: 'Admin Auditoria Test', role: 'ADMIN', passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    await prisma.user.upsert({
      where: { rut: studentRut },
      update: { name: 'Estudiante Auditoria Test', role: 'STUDENT', courseId: course.id, isActive: true, passwordHash: hash },
      create: { rut: studentRut, name: 'Estudiante Auditoria Test', role: 'STUDENT', courseId: course.id, passwordHash: hash, mustChangePassword: false, isActive: true },
    });

    exam = await prisma.exam.create({
      data: {
        title: 'Evaluación Auditoría E2E Test',
        subject: 'Lenguaje',
        level: '8B',
        pdfPath: 'audit-test.pdf',
        optionsCount: 4,
        orderNumber: 91,
        examType: 'ENSAYO',
        questions: {
          create: [
            { questionNumber: 1, correctAnswer: 'A', questionType: 'MULTIPLE_CHOICE', maxPoints: 1, difficulty: 0.0, guessing: 0.25 },
            { questionNumber: 2, correctAnswer: 'B', questionType: 'MULTIPLE_CHOICE', maxPoints: 1, difficulty: 0.0, guessing: 0.25 },
          ],
        },
      },
      include: { questions: true },
    });

    const now = new Date();
    assignment = await prisma.examAssignment.create({
      data: {
        examId: exam.id,
        courseId: course.id,
        opensAt: new Date(now.getTime() - 60 * 60 * 1000),
        closesAt: new Date(now.getTime() + 60 * 60 * 1000),
        status: 'ONGOING',
      },
    });
  });

  afterAll(async () => {
    await auditoria.flushAuditoria();
    if (createdLogIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: createdLogIds } } }).catch(() => {});
    }
    // Limpiar también logs generados durante los tests por estos usuarios de prueba
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { usuarioId: { in: [adminRut, directorRut, teacherRut, studentRut] } },
          { desencadenadoPorId: { in: [adminRut, directorRut, teacherRut, studentRut] } },
          { modulo: 'TestAuditoria' },
        ],
      },
    }).catch(() => {});

    if (assignment) {
      await prisma.submission.deleteMany({ where: { assignmentId: assignment.id } }).catch(() => {});
      await prisma.examAssignment.delete({ where: { id: assignment.id } }).catch(() => {});
    }
    if (exam) {
      await prisma.exam.delete({ where: { id: exam.id } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { rut: { in: [adminRut, studentRut] } } }).catch(() => {});
    if (course) {
      await prisma.course.delete({ where: { id: course.id } }).catch(() => {});
    }
  });

  test('Control de acceso RBAC e inmutabilidad operativa', async () => {
    // Sin autenticación -> 401
    const unauth = await request(app).get('/api/auditoria');
    expect(unauth.status).toBe(401);

    // Estudiante -> 403
    const stuRes = await request(app)
      .get('/api/auditoria')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(stuRes.status).toBe(403);

    // Docente -> 403
    const teaRes = await request(app)
      .get('/api/auditoria')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(teaRes.status).toBe(403);

    // Director puede consultar y ver KPIs
    const dirList = await request(app)
      .get('/api/auditoria')
      .set('Authorization', `Bearer ${directorToken}`);
    expect(dirList.status).toBe(200);
    expect(Array.isArray(dirList.body.items)).toBe(true);

    const dirKpis = await request(app)
      .get('/api/auditoria/kpis')
      .set('Authorization', `Bearer ${directorToken}`);
    expect(dirKpis.status).toBe(200);
    expect(typeof dirKpis.body.total_general).toBe('number');

    // Director NO puede purgar logs históricos (solo ADMIN)
    const dirPurge = await request(app)
      .post('/api/auditoria/limpiar')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ dias: 180 });
    expect(dirPurge.status).toBe(403);

    // No existen endpoints de edición ni eliminación individual (inmutabilidad)
    const putRes = await request(app)
      .put('/api/auditoria/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ descripcion: 'Alterado' });
    expect(putRes.status).toBe(404);

    const patchRes = await request(app)
      .patch('/api/auditoria/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ descripcion: 'Alterado' });
    expect(patchRes.status).toBe(404);

    const delRes = await request(app)
      .delete('/api/auditoria/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(404);
  });

  test('registrarAuditoria soporta IP x-forwarded-for, User-Agent y trazabilidad Plataforma + Desencadenante', async () => {
    const fakeReq = {
      user: { rut: teacherRut, name: 'Docente Auditoria Test', role: 'TEACHER' },
      headers: {
        'x-forwarded-for': '200.54.10.25, 10.0.0.1',
        'user-agent': 'Mozilla/5.0 AuditTestBrowser/1.0',
      },
    };

    // 1) Acción directa de usuario
    auditoria.registrarAuditoria({
      req: fakeReq,
      modulo: 'TestAuditoria',
      accion: 'Crear',
      nivel: 'success',
      entidad: 'Prueba Unitaria',
      entidad_id: 99,
      descripcion: 'Acción directa de prueba con proxy IP',
      detalles: { campo: 'valor_original' },
    });

    // 2) Acción automática de la plataforma desencadenada por un usuario
    auditoria.registrarAuditoria({
      req: fakeReq,
      esPlataforma: true,
      desencadenadoPor: { rut: adminRut, name: 'Admin Auditoria Test', role: 'ADMIN' },
      modulo: 'TestAuditoria',
      accion: 'Proceso Automático',
      nivel: 'warning',
      entidad: 'Evaluación',
      entidad_id: exam.id,
      descripcion: 'La plataforma ejecutó ajuste automático de prueba',
      detalles: { motivo: 'trigger_test' },
    });

    await auditoria.flushAuditoria();

    const listRes = await request(app)
      .get('/api/auditoria?modulo=TestAuditoria&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const items = listRes.body.items;
    expect(items.length).toBeGreaterThanOrEqual(2);

    const directLog = items.find((i) => i.accion === 'Crear');
    expect(directLog).toBeDefined();
    expect(directLog.origen_actor).toBe('USUARIO');
    expect(directLog.usuario_id).toBe(teacherRut);
    expect(directLog.usuario_rol).toBe('TEACHER');
    expect(directLog.ip).toBe('200.54.10.25');
    expect(directLog.user_agent).toBe('Mozilla/5.0 AuditTestBrowser/1.0');
    createdLogIds.push(directLog.id);

    const platformLog = items.find((i) => i.accion === 'Proceso Automático');
    expect(platformLog).toBeDefined();
    expect(platformLog.origen_actor).toBe('PLATAFORMA');
    expect(platformLog.usuario_nombre).toBe('Plataforma Automática');
    expect(platformLog.usuario_rol).toBe('SISTEMA');
    expect(platformLog.desencadenado_por_id).toBe(adminRut);
    expect(platformLog.desencadenado_por_nombre).toBe('Admin Auditoria Test');
    expect(platformLog.desencadenado_por_rol).toBe('ADMIN');
    expect(platformLog.descripcion).toContain('Admin Auditoria Test');
    createdLogIds.push(platformLog.id);

    // Verificar detalle JSON estructurado /:id
    const detailRes = await request(app)
      .get(`/api/auditoria/${platformLog.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.detalles_parsed).toBeDefined();
    expect(detailRes.body.detalles_parsed._plataforma.ejecutado_por).toBe('Plataforma Automática');
    expect(detailRes.body.detalles_parsed._plataforma.desencadenado_por.id).toBe(adminRut);
  });

  test('Flujo E2E: login, rendición estudiantil y recálculo generan logs de usuario y de plataforma', async () => {
    // 1. Login fallido y login exitoso
    await request(app)
      .post('/api/auth/login')
      .send({ rut: studentRut, password: 'clave_incorrecta' });

    const okLogin = await request(app)
      .post('/api/auth/login')
      .send({ rut: studentRut, password: 'audit1234' });
    expect(okLogin.status).toBe(200);

    // 2. Estudiante inicia y entrega evaluación -> dispara Entrega (USUARIO) + Calificación Automática (PLATAFORMA desencadenada por alumno)
    const startRes = await request(app)
      .post(`/api/student/assignments/${assignment.id}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(startRes.status).toBe(200);
    const subId = startRes.body.submissionId;

    const [q1, q2] = exam.questions;
    const submitRes = await request(app)
      .post(`/api/student/submissions/${subId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answers: { [q1.id]: 'A', [q2.id]: 'B' } });
    expect(submitRes.status).toBe(200);

    // 3. Admin ejecuta recálculo masivo -> dispara Recalcular Notas (USUARIO) + Recálculo Automático de Notas (PLATAFORMA desencadenada por Admin)
    const recalcRes = await request(app)
      .post(`/api/admin/exams/${exam.id}/recalculate-grades`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignmentId: assignment.id, note: 'Test auditoría recálculo' });
    expect(recalcRes.status).toBe(200);

    await auditoria.flushAuditoria();

    const logsRes = await request(app)
      .get('/api/auditoria?limit=50')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(logsRes.status).toBe(200);
    const items = logsRes.body.items;

    const failedLogin = items.find((l) => l.accion === 'Login Fallido' && l.entidad_id === studentRut);
    expect(failedLogin).toBeDefined();
    expect(failedLogin.nivel).toBe('warning');

    const okLoginLog = items.find((l) => l.accion === 'Iniciar Sesión' && l.usuario_id === studentRut);
    expect(okLoginLog).toBeDefined();

    const submitUserLog = items.find((l) => l.accion === 'Entregar Evaluación' && l.usuario_id === studentRut);
    expect(submitUserLog).toBeDefined();

    const autoGradePlatformLog = items.find(
      (l) =>
        l.origen_actor === 'PLATAFORMA' &&
        l.accion === 'Calificación Automática' &&
        l.desencadenado_por_id === studentRut
    );
    expect(autoGradePlatformLog).toBeDefined();
    expect(autoGradePlatformLog.usuario_nombre).toBe('Plataforma Automática');

    const recalcPlatformLog = items.find(
      (l) =>
        l.origen_actor === 'PLATAFORMA' &&
        (l.accion === 'Recálculo Automático de Notas' || l.accion === 'Recálculo Automático de Nota') &&
        l.desencadenado_por_id === adminRut
    );
    expect(recalcPlatformLog).toBeDefined();
    expect(recalcPlatformLog.desencadenado_por_id).toBe(adminRut);
  });

  test('Filtros combinables, exportación XLSX/CSV y purga histórica con auto-registro crítico', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Filtro por origen_actor=PLATAFORMA y fecha
    const filtered = await request(app)
      .get(`/api/auditoria?origen_actor=PLATAFORMA&desde=${today}&hasta=${today}&busqueda=Plataforma`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.items.length).toBeGreaterThanOrEqual(1);
    expect(filtered.body.items.every((i) => i.origen_actor === 'PLATAFORMA')).toBe(true);

    // Exportación CSV con UTF-8 BOM
    const csvRes = await request(app)
      .get('/api/auditoria/exportar?formato=csv&modulo=TestAuditoria')
      .set('Authorization', `Bearer ${directorToken}`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text.charCodeAt(0)).toBe(0xfeff);
    expect(csvRes.text).toContain('Plataforma Automática');
    expect(csvRes.text).toContain('Usuario que Desencadenó');

    // Exportación Excel nativo (.xlsx)
    const xlsxRes = await request(app)
      .get('/api/auditoria/exportar?formato=xlsx&modulo=TestAuditoria')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(xlsxRes.status).toBe(200);
    expect(xlsxRes.headers['content-type']).toContain('spreadsheetml.sheet');
    // Archivo ZIP/XLSX inicia con bytes "PK"
    expect(xlsxRes.body.slice(0, 2).toString('utf8')).toBe('PK');

    // Insertar un log antiguo (> 200 días) para probar /limpiar
    const oldDate = new Date(Date.now() - 210 * 24 * 60 * 60 * 1000);
    const oldLog = await prisma.auditLog.create({
      data: {
        fechaHora: oldDate,
        origenActor: 'USUARIO',
        usuarioId: adminRut,
        usuarioEmail: adminRut,
        usuarioNombre: 'Admin Auditoria Test',
        usuarioRol: 'ADMIN',
        modulo: 'TestAuditoria',
        accion: 'Registro Antiguo',
        nivel: 'info',
        descripcion: 'Evento histórico simulado para purga',
      },
    });

    const purgeRes = await request(app)
      .post('/api/auditoria/limpiar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ dias: 180 });
    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body.success).toBe(true);
    expect(purgeRes.body.eliminados).toBeGreaterThanOrEqual(1);

    // El registro antiguo ya no debe existir
    const checkOld = await prisma.auditLog.findUnique({ where: { id: oldLog.id } });
    expect(checkOld).toBeNull();

    // La purga debe haberse auto-registrado como log crítico (danger)
    await auditoria.flushAuditoria();
    const afterPurgeLogs = await request(app)
      .get('/api/auditoria?modulo=Auditor%C3%ADa&nivel=danger&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(afterPurgeLogs.status).toBe(200);
    const purgeEntry = afterPurgeLogs.body.items.find(
      (i) => i.accion === 'Limpieza Logs' && i.usuario_id === adminRut
    );
    expect(purgeEntry).toBeDefined();
    expect(purgeEntry.nivel).toBe('danger');
  });
});
