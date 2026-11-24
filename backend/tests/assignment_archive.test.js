require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const auditoria = require('../src/services/auditoria');

describe('Sistema de Archivado Manual y Automático de Evaluaciones', () => {
  const adminRut = '96111111-1';
  const teacherRut = '96222222-2';
  const otherTeacherRut = '96333333-3';
  const studentRut = '96444444-4';

  const adminToken = signToken({ rut: adminRut, role: 'ADMIN', name: 'Administrador Test' });
  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Docente Archivo Test' });
  const otherTeacherToken = signToken({ rut: otherTeacherRut, role: 'TEACHER', name: 'Otro Docente Test' });
  const studentToken = signToken({ rut: studentRut, role: 'STUDENT', name: 'Estudiante Test' });

  let course;
  let otherCourse;
  let exam;
  let closedAssignment;
  let openAssignment;

  beforeAll(async () => {
    await auditoria.inicializarTablaAuditoria();
    const hash = await bcrypt.hash('testpass123', 10);

    // Limpieza de datos de prueba
    await prisma.submissionAnswer.deleteMany({
      where: { submission: { studentRut } }
    }).catch(() => {});
    await prisma.submission.deleteMany({
      where: { studentRut }
    }).catch(() => {});
    await prisma.examAssignment.deleteMany({
      where: { assignedTeacherRut: { in: [teacherRut, otherTeacherRut] } }
    }).catch(() => {});
    await prisma.question.deleteMany({
      where: { exam: { title: { in: ['Examen de Prueba para Archivo', 'Examen Abierto para Archivo'] } } }
    }).catch(() => {});
    await prisma.exam.deleteMany({
      where: { title: { in: ['Examen de Prueba para Archivo', 'Examen Abierto para Archivo'] } }
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { rut: { in: [adminRut, teacherRut, otherTeacherRut, studentRut] } }
    }).catch(() => {});
    await prisma.course.deleteMany({
      where: { year: 2096 }
    }).catch(() => {});

    // Crear cursos
    course = await prisma.course.create({
      data: { level: '7B', letter: 'A', year: 2096 }
    });
    otherCourse = await prisma.course.create({
      data: { level: '8B', letter: 'B', year: 2096 }
    });

    // Crear usuarios
    await prisma.user.create({
      data: {
        rut: adminRut,
        name: 'Administrador Test',
        role: 'ADMIN',
        passwordHash: hash,
        mustChangePassword: false,
      }
    });

    await prisma.user.create({
      data: {
        rut: teacherRut,
        name: 'Docente Archivo Test',
        role: 'TEACHER',
        passwordHash: hash,
        mustChangePassword: false,
      }
    });

    await prisma.user.create({
      data: {
        rut: otherTeacherRut,
        name: 'Otro Docente Test',
        role: 'TEACHER',
        passwordHash: hash,
        mustChangePassword: false,
      }
    });

    await prisma.user.create({
      data: {
        rut: studentRut,
        name: 'Estudiante Test',
        role: 'STUDENT',
        passwordHash: hash,
        courseId: course.id,
        mustChangePassword: false,
      }
    });

    // Crear examen
    exam = await prisma.exam.create({
      data: {
        title: 'Examen de Prueba para Archivo',
        subject: 'Matemática',
        level: '7B',
        examType: 'ENSAYO_REGULAR',
        orderNumber: 1,
        pdfPath: 'test_archive.pdf',
      }
    });

    await prisma.question.createMany({
      data: [
        { examId: exam.id, questionNumber: 1, correctAnswer: 'A' },
        { examId: exam.id, questionNumber: 2, correctAnswer: 'B' },
      ]
    });

    // Asignación cerrada (rendida en el pasado reciente, < 30 días para evitar auto-archivado inmediato)
    const pastOpen = new Date(Date.now() - 12 * 24 * 3600 * 1000);
    const pastClose = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    closedAssignment = await prisma.examAssignment.create({
      data: {
        examId: exam.id,
        courseId: course.id,
        assignedTeacherRut: teacherRut,
        opensAt: pastOpen,
        closesAt: pastClose,
        isArchived: false,
      }
    });

    // Asignación activa / abierta en otro examen
    const openExam = await prisma.exam.create({
      data: {
        title: 'Examen Abierto para Archivo',
        subject: 'Historia',
        level: '7B',
        examType: 'ENSAYO_REGULAR',
        orderNumber: 2,
        pdfPath: 'test_archive2.pdf',
      }
    });

    const nowOpen = new Date(Date.now() - 1 * 3600 * 1000);
    const nowClose = new Date(Date.now() + 24 * 3600 * 1000);
    openAssignment = await prisma.examAssignment.create({
      data: {
        examId: openExam.id,
        courseId: course.id,
        assignedTeacherRut: teacherRut,
        opensAt: nowOpen,
        closesAt: nowClose,
        isArchived: false,
      }
    });
  });

  afterAll(async () => {
    await prisma.submissionAnswer.deleteMany({
      where: { submission: { studentRut } }
    }).catch(() => {});
    await prisma.submission.deleteMany({
      where: { studentRut }
    }).catch(() => {});
    await prisma.examAssignment.deleteMany({
      where: { assignedTeacherRut: { in: [teacherRut, otherTeacherRut] } }
    }).catch(() => {});
    await prisma.question.deleteMany({
      where: { exam: { title: { in: ['Examen de Prueba para Archivo', 'Examen Abierto para Archivo'] } } }
    }).catch(() => {});
    await prisma.exam.deleteMany({
      where: { title: { in: ['Examen de Prueba para Archivo', 'Examen Abierto para Archivo'] } }
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { rut: { in: [adminRut, teacherRut, otherTeacherRut, studentRut] } }
    }).catch(() => {});
    await prisma.course.deleteMany({
      where: { year: 2096 }
    }).catch(() => {});
    await prisma.$disconnect();
  });

  describe('1. Archivado y Desarchivado Manual por Admin', () => {
    it('debe rechazar archivar una evaluación que aún está en curso', async () => {
      const res = await request(app)
        .post(`/api/admin/assignments/${openAssignment.id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('en curso');
    });

    it('debe permitir archivar una evaluación cerrada', async () => {
      const res = await request(app)
        .post(`/api/admin/assignments/${closedAssignment.id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.isArchived).toBe(true);
      expect(res.body.archivedBy).toBe(adminRut);
    });

    it('GET /admin/assignments no debe listar la evaluación archivada por defecto', async () => {
      const res = await request(app)
        .get('/api/admin/assignments?year=2096')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.map((a) => a.id);
      expect(ids).not.toContain(closedAssignment.id);
      expect(ids).toContain(openAssignment.id);
    });

    it('GET /admin/assignments?archived=true debe listar la evaluación archivada', async () => {
      const res = await request(app)
        .get('/api/admin/assignments?year=2096&archived=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.map((a) => a.id);
      expect(ids).toContain(closedAssignment.id);
      expect(ids).not.toContain(openAssignment.id);
    });

    it('debe desarchivar la evaluación correctamente', async () => {
      const res = await request(app)
        .post(`/api/admin/assignments/${closedAssignment.id}/unarchive`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.isArchived).toBe(false);

      // Ahora debe volver a aparecer en la lista por defecto
      const listRes = await request(app)
        .get('/api/admin/assignments?year=2096')
        .set('Authorization', `Bearer ${adminToken}`);
      const ids = listRes.body.map((a) => a.id);
      expect(ids).toContain(closedAssignment.id);
    });
  });

  describe('2. Archivado y Desarchivado por Docente', () => {
    it('debe permitir al docente archivar una evaluación cerrada de su curso', async () => {
      const res = await request(app)
        .post(`/api/teacher/assignments/${closedAssignment.id}/archive`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.isArchived).toBe(true);
    });

    it('debe ocultar la archivada en GET /teacher/assignments por defecto y mostrarla con ?archived=true', async () => {
      const defaultRes = await request(app)
        .get('/api/teacher/assignments?year=2096')
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(defaultRes.status).toBe(200);
      const defaultIds = defaultRes.body.map((a) => a.id);
      expect(defaultIds).not.toContain(closedAssignment.id);

      const archivedRes = await request(app)
        .get('/api/teacher/assignments?year=2096&archived=true')
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(archivedRes.status).toBe(200);
      const archivedIds = archivedRes.body.map((a) => a.id);
      expect(archivedIds).toContain(closedAssignment.id);
    });

    it('no debe permitir a un docente archivar asignaciones que no le pertenecen', async () => {
      const res = await request(app)
        .post(`/api/teacher/assignments/${closedAssignment.id}/unarchive`)
        .set('Authorization', `Bearer ${otherTeacherToken}`);

      expect(res.status).toBe(403);
    });

    it('debe permitir al docente desarchivar su evaluación', async () => {
      const res = await request(app)
        .post(`/api/teacher/assignments/${closedAssignment.id}/unarchive`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.isArchived).toBe(false);
    });
  });

  describe('3. Ajustes de Auto-archivado y Ejecución Automática', () => {
    it('debe consultar y actualizar la configuración de auto-archivado (15, 30, 90 días)', async () => {
      // Consultar configuración inicial
      const getRes = await request(app)
        .get('/api/admin/settings/archive')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body).toHaveProperty('enabled');
      expect(getRes.body).toHaveProperty('days');

      // Actualizar a 15 días
      const putRes = await request(app)
        .put('/api/admin/settings/archive')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true, days: 15 });

      expect(putRes.status).toBe(200);
      expect(putRes.body.ok).toBe(true);
      expect(putRes.body.settings.days).toBe(15);
      expect(putRes.body.settings.enabled).toBe(true);
    });

    it('debe ejecutar auto-archivado y archivar solo asignaciones que excedan los días configurados', async () => {
      const autoExam1 = await prisma.exam.create({
        data: {
          title: 'Examen Auto 1 Antiguo',
          subject: 'Ciencias',
          level: '7B',
          examType: 'ENSAYO_REGULAR',
          orderNumber: 3,
          pdfPath: 'auto1.pdf',
        }
      });

      const autoExam2 = await prisma.exam.create({
        data: {
          title: 'Examen Auto 2 Reciente',
          subject: 'Inglés',
          level: '7B',
          examType: 'ENSAYO_REGULAR',
          orderNumber: 4,
          pdfPath: 'auto2.pdf',
        }
      });

      // Asignación cerrada hace 20 días (> 15 días)
      const oldCloses = new Date(Date.now() - 20 * 24 * 3600 * 1000);
      const oldAssignment = await prisma.examAssignment.create({
        data: {
          examId: autoExam1.id,
          courseId: course.id,
          assignedTeacherRut: teacherRut,
          opensAt: new Date(Date.now() - 25 * 24 * 3600 * 1000),
          closesAt: oldCloses,
          isArchived: false,
        }
      });

      // Asignación cerrada hace 5 días (< 15 días)
      const recentCloses = new Date(Date.now() - 5 * 24 * 3600 * 1000);
      const recentAssignment = await prisma.examAssignment.create({
        data: {
          examId: autoExam2.id,
          courseId: course.id,
          assignedTeacherRut: teacherRut,
          opensAt: new Date(Date.now() - 6 * 24 * 3600 * 1000),
          closesAt: recentCloses,
          isArchived: false,
        }
      });

      // Ejecutar auto-archivado
      const runRes = await request(app)
        .post('/api/admin/assignments/auto-archive/run')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(runRes.status).toBe(200);
      expect(runRes.body.ok).toBe(true);
      expect(runRes.body.archivedCount).toBeGreaterThanOrEqual(1);

      // Verificar en BD
      const checkOld = await prisma.examAssignment.findUnique({ where: { id: oldAssignment.id } });
      const checkRecent = await prisma.examAssignment.findUnique({ where: { id: recentAssignment.id } });

      expect(checkOld.isArchived).toBe(true);
      expect(checkOld.archivedBy).toBe('SISTEMA_AUTO');
      expect(checkOld.archivedReason).toBe('AUTO_AFTER_15_DAYS');

      expect(checkRecent.isArchived).toBe(false);

      // Limpieza
      await prisma.examAssignment.deleteMany({
        where: { id: { in: [oldAssignment.id, recentAssignment.id] } }
      });
      await prisma.exam.deleteMany({
        where: { id: { in: [autoExam1.id, autoExam2.id] } }
      });
    });
  });

  describe('4. Vista del Estudiante con Marcador de Archivado', () => {
    it('debe incluir el campo isArchived en GET /student/assignments', async () => {
      // Archivar closedAssignment
      await prisma.examAssignment.update({
        where: { id: closedAssignment.id },
        data: { isArchived: true, archivedAt: new Date() }
      });

      const res = await request(app)
        .get('/api/student/assignments')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      const closed = res.body.find((a) => a.id === closedAssignment.id);
      const open = res.body.find((a) => a.id === openAssignment.id);

      expect(closed).toBeDefined();
      expect(closed.isArchived).toBe(true);

      expect(open).toBeDefined();
      expect(open.isArchived).toBe(false);
    });
  });
});
