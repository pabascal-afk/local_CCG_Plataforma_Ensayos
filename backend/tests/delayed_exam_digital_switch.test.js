require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const auditoria = require('../src/services/auditoria');

describe('Toma de Pruebas Atrasadas en Formato Digital (Hybrid Printed/Digital)', () => {
  const teacherRut = '95111111-1';
  const student1Rut = '95222222-2';
  const student2Rut = '95333333-3';

  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Docente Formato Test' });
  const student1Token = signToken({ rut: student1Rut, role: 'STUDENT', name: 'Estudiante Atrasado 1' });
  const student2Token = signToken({ rut: student2Rut, role: 'STUDENT', name: 'Estudiante Atrasado 2' });

  let course;
  let exam;
  let assignment;

  beforeAll(async () => {
    await auditoria.inicializarTablaAuditoria();
    const hash = await bcrypt.hash('testpass123', 10);

    // Limpieza de datos previos
    await prisma.submissionAnswer.deleteMany({
      where: { submission: { studentRut: { in: [student1Rut, student2Rut] } } }
    }).catch(() => {});
    await prisma.submission.deleteMany({
      where: { studentRut: { in: [student1Rut, student2Rut] } }
    }).catch(() => {});
    await prisma.examAssignment.deleteMany({
      where: { assignedTeacherRut: teacherRut }
    }).catch(() => {});
    await prisma.question.deleteMany({
      where: { exam: { title: 'Examen Test Modalidad Hibrida' } }
    }).catch(() => {});
    await prisma.exam.deleteMany({
      where: { title: 'Examen Test Modalidad Hibrida' }
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { rut: { in: [teacherRut, student1Rut, student2Rut] } }
    }).catch(() => {});
    await prisma.course.deleteMany({
      where: { year: 2095 }
    }).catch(() => {});

    // Crear curso y usuarios
    course = await prisma.course.create({
      data: { level: '8B', letter: 'A', year: 2095 }
    });

    await prisma.user.create({
      data: {
        rut: teacherRut,
        name: 'Docente Formato Test',
        role: 'TEACHER',
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true
      }
    });

    await prisma.user.create({
      data: {
        rut: student1Rut,
        name: 'Estudiante Atrasado 1',
        role: 'STUDENT',
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true,
        courseId: course.id
      }
    });

    await prisma.user.create({
      data: {
        rut: student2Rut,
        name: 'Estudiante Atrasado 2',
        role: 'STUDENT',
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true,
        courseId: course.id
      }
    });

    // Vincular profesor al curso
    await prisma.teacherCourse.create({
      data: { teacherRut, courseId: course.id, subject: 'Historia' }
    }).catch(() => {});

    // Crear Examen con preguntas
    exam = await prisma.exam.create({
      data: {
        title: 'Examen Test Modalidad Hibrida',
        subject: 'Historia',
        level: '8B',
        durationMinutes: 90,
        pdfPath: 'uploads/test_hybrid.pdf',
        questions: {
          create: [
            {
              questionNumber: 1,
              correctAnswer: 'A',
              questionType: 'MULTIPLE_CHOICE',
              maxPoints: 1
            },
            {
              questionNumber: 2,
              correctAnswer: 'OPEN',
              questionType: 'WRITTEN',
              maxPoints: 3
            }
          ]
        }
      }
    });

    // Crear Asignación en modalidad PAPEL (PRINTED)
    const now = new Date();
    const opensAt = new Date(now.getTime() - 2 * 3600 * 1000);
    const closesAt = new Date(now.getTime() + 2 * 3600 * 1000);

    assignment = await prisma.examAssignment.create({
      data: {
        examId: exam.id,
        courseId: course.id,
        assignedTeacherRut: teacherRut,
        opensAt,
        closesAt,
        status: 'ONGOING',
        applicationMode: 'PRINTED'
      }
    });
  });

  afterAll(async () => {
    await auditoria.flushAuditoria();
    await prisma.submissionAnswer.deleteMany({
      where: { submission: { assignmentId: assignment?.id } }
    }).catch(() => {});
    await prisma.submission.deleteMany({
      where: { assignmentId: assignment?.id }
    }).catch(() => {});
    await prisma.examAssignment.deleteMany({
      where: { id: assignment?.id }
    }).catch(() => {});
    await prisma.teacherCourse.deleteMany({
      where: { teacherRut }
    }).catch(() => {});
    await prisma.question.deleteMany({
      where: { examId: exam?.id }
    }).catch(() => {});
    await prisma.exam.deleteMany({
      where: { id: exam?.id }
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { rut: { in: [teacherRut, student1Rut, student2Rut] } }
    }).catch(() => {});
    await prisma.course.deleteMany({
      where: { id: course?.id }
    }).catch(() => {});
  });

  test('1. Alumno en prueba PAPEL ve estado PRINTED y /start retorna 403', async () => {
    // Listado de asignaciones del estudiante
    const resList = await request(app)
      .get('/api/student/assignments')
      .set('Authorization', `Bearer ${student1Token}`);

    expect(resList.status).toBe(200);
    const found = resList.body.find(a => a.id === assignment.id);
    expect(found).toBeDefined();
    expect(found.state).toBe('PRINTED');
    expect(found.applicationMode).toBe('PRINTED');

    // Intentar rendir digitalmente por /start debe arrojar 403
    const resStart = await request(app)
      .post(`/api/student/assignments/${assignment.id}/start`)
      .set('Authorization', `Bearer ${student1Token}`);

    expect(resStart.status).toBe(403);
    expect(resStart.body.error).toContain('papel');
  });

  test('2. Docente reactiva a Estudiante 1 con applicationMode=DIGITAL: estudiante puede rendir online', async () => {
    const futureDeadline = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

    // Docente reactiva individualmente al estudiante 1 seleccionando DIGITAL
    const resReactivate = await request(app)
      .post(`/api/teacher/assignments/${assignment.id}/students/${student1Rut}/reactivate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        deadline: futureDeadline,
        resetMode: 'KEEP_ANSWERS',
        applicationMode: 'DIGITAL'
      });

    expect(resReactivate.status).toBe(200);
    expect(resReactivate.body.applicationMode).toBe('DIGITAL');

    // Estudiante 1 consulta sus evaluaciones
    const resList = await request(app)
      .get('/api/student/assignments')
      .set('Authorization', `Bearer ${student1Token}`);

    expect(resList.status).toBe(200);
    const found = resList.body.find(a => a.id === assignment.id);
    expect(found).toBeDefined();
    expect(found.state).not.toBe('PRINTED');
    expect(found.applicationMode).toBe('DIGITAL');

    // Estudiante 1 inicia la prueba digitalmente con éxito (código 200)
    const resStart = await request(app)
      .post(`/api/student/assignments/${assignment.id}/start`)
      .set('Authorization', `Bearer ${student1Token}`);

    expect(resStart.status).toBe(200);
    expect(resStart.body.assignmentId).toBe(assignment.id);

    // Docente monitorea en vivo: estudiante 1 aparece con effectiveMode=DIGITAL
    const resLive = await request(app)
      .get(`/api/teacher/assignments/${assignment.id}/live`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(resLive.status).toBe(200);
    expect(resLive.body.assignment.applicationMode).toBe('PRINTED'); // Asignación general sigue siendo papel
    const st1 = resLive.body.students.find(s => s.rut === student1Rut);
    expect(st1).toBeDefined();
    expect(st1.applicationMode).toBe('DIGITAL');
    expect(st1.effectiveMode).toBe('DIGITAL');
  });

  test('3. Docente realiza reactivación masiva con applicationMode=DIGITAL para Estudiante 2', async () => {
    const futureDeadline = new Date(Date.now() + 5 * 3600 * 1000).toISOString();

    const resBulk = await request(app)
      .post(`/api/teacher/assignments/${assignment.id}/students/bulk-reactivate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        ruts: [student2Rut],
        deadline: futureDeadline,
        resetMode: 'KEEP_ANSWERS',
        applicationMode: 'DIGITAL'
      });

    expect(resBulk.status).toBe(200);
    expect(resBulk.body.affectedCount).toBe(1);

    // Estudiante 2 ahora puede iniciar digitalmente
    const resStart = await request(app)
      .post(`/api/student/assignments/${assignment.id}/start`)
      .set('Authorization', `Bearer ${student2Token}`);

    expect(resStart.status).toBe(200);
  });

  test('4. Docente cambia la modalidad general del examen a DIGITAL vía PATCH /mode', async () => {
    const resMode = await request(app)
      .patch(`/api/teacher/assignments/${assignment.id}/mode`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ applicationMode: 'DIGITAL' });

    expect(resMode.status).toBe(200);
    expect(resMode.body.applicationMode).toBe('DIGITAL');

    // En teacher/assignments se refleja DIGITAL
    const resList = await request(app)
      .get('/api/teacher/assignments')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(resList.status).toBe(200);
    const found = resList.body.find(a => a.id === assignment.id);
    expect(found).toBeDefined();
    expect(found.applicationMode).toBe('DIGITAL');
  });

  test('5. Reactivación del curso con applicationMode=PRINTED cambia la modalidad del examen', async () => {
    const futureClosesAt = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

    const resCourseReactivate = await request(app)
      .post(`/api/teacher/assignments/${assignment.id}/reactivate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        closesAt: futureClosesAt,
        scope: 'PENDING_ONLY',
        applicationMode: 'PRINTED'
      });

    expect(resCourseReactivate.status).toBe(200);
    expect(resCourseReactivate.body.assignment.applicationMode).toBe('PRINTED');
  });
});
