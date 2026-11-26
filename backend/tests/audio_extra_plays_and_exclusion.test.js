require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');
const auditoria = require('../src/services/auditoria');

describe('Gestión de Escuchas Extra de Audio y Exclusión Justificada de Informes', () => {
  const teacherRut = '96111111-1';
  const student1Rut = '96222222-2';
  const student2Rut = '96333333-3';

  const teacherToken = signToken({ rut: teacherRut, role: 'TEACHER', name: 'Docente Audio Test' });
  const student1Token = signToken({ rut: student1Rut, role: 'STUDENT', name: 'Estudiante Test 1' });
  const student2Token = signToken({ rut: student2Rut, role: 'STUDENT', name: 'Estudiante Test 2' });

  let course;
  let exam;
  let assignment;
  let clip1;
  let clip2;
  let question1;

  beforeAll(async () => {
    await auditoria.inicializarTablaAuditoria();
    const hash = await bcrypt.hash('testpass123', 10);

    // Limpieza
    await prisma.assignmentExclusion.deleteMany({
      where: { studentRut: { in: [student1Rut, student2Rut] } }
    }).catch(() => {});
    await prisma.submissionAnswer.deleteMany({
      where: { submission: { studentRut: { in: [student1Rut, student2Rut] } } }
    }).catch(() => {});
    await prisma.submission.deleteMany({
      where: { studentRut: { in: [student1Rut, student2Rut] } }
    }).catch(() => {});
    await prisma.examAssignment.deleteMany({
      where: { assignedTeacherRut: teacherRut }
    }).catch(() => {});
    await prisma.examAudioClip.deleteMany({
      where: { exam: { title: 'Examen Test Audio y Exclusion' } }
    }).catch(() => {});
    await prisma.question.deleteMany({
      where: { exam: { title: 'Examen Test Audio y Exclusion' } }
    }).catch(() => {});
    await prisma.exam.deleteMany({
      where: { title: 'Examen Test Audio y Exclusion' }
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { rut: { in: [teacherRut, student1Rut, student2Rut] } }
    }).catch(() => {});
    await prisma.course.deleteMany({
      where: { year: 2096 }
    }).catch(() => {});

    // Crear curso y usuarios
    course = await prisma.course.create({
      data: { level: '7B', letter: 'B', year: 2096 }
    });

    const teacherUser = await prisma.user.create({
      data: {
        rut: teacherRut,
        name: 'Docente Audio Test',
        role: 'TEACHER',
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true
      }
    });

    await prisma.user.create({
      data: {
        rut: student1Rut,
        name: 'Estudiante Test 1',
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
        name: 'Estudiante Test 2',
        role: 'STUDENT',
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true,
        courseId: course.id
      }
    });

    // Crear Examen con 2 audios y preguntas
    exam = await prisma.exam.create({
      data: {
        title: 'Examen Test Audio y Exclusion',
        subject: 'Inglés',
        level: '7B',
        gradingMode: 'NORMAL',
        passThreshold: 0.6,
        optionsCount: 4,
        pdfPath: 'dummy-test-audio.pdf',
        createdById: teacherUser.id
      }
    });

    clip1 = await prisma.examAudioClip.create({
      data: {
        examId: exam.id,
        title: 'Listening Part 1',
        audioPath: 'dummy-audio-1.mp3',
        maxPlays: 2,
        orderIndex: 1,
        questionNumbers: JSON.stringify([1])
      }
    });

    clip2 = await prisma.examAudioClip.create({
      data: {
        examId: exam.id,
        title: 'Listening Part 2',
        audioPath: 'dummy-audio-2.mp3',
        maxPlays: 3,
        orderIndex: 2,
        questionNumbers: JSON.stringify([2])
      }
    });

    question1 = await prisma.question.create({
      data: {
        examId: exam.id,
        questionNumber: 1,
        questionType: 'MULTIPLE_CHOICE',
        correctAnswer: 'A',
        maxPoints: 1,
        skill: 'Comprensión Auditiva',
        axis: 'Listening'
      }
    });

    await prisma.question.create({
      data: {
        examId: exam.id,
        questionNumber: 2,
        questionType: 'MULTIPLE_CHOICE',
        correctAnswer: 'B',
        maxPoints: 1,
        skill: 'Comprensión Auditiva',
        axis: 'Listening'
      }
    });

    assignment = await prisma.examAssignment.create({
      data: {
        examId: exam.id,
        courseId: course.id,
        assignedTeacherRut: teacherRut,
        opensAt: new Date(Date.now() - 3600000),
        closesAt: new Date(Date.now() + 3600000),
        applicationMode: 'DIGITAL'
      }
    });
  });

  afterAll(async () => {
    await prisma.assignmentExclusion.deleteMany({
      where: { studentRut: { in: [student1Rut, student2Rut] } }
    }).catch(() => {});
    await prisma.submissionAnswer.deleteMany({
      where: { submission: { studentRut: { in: [student1Rut, student2Rut] } } }
    }).catch(() => {});
    await prisma.submission.deleteMany({
      where: { studentRut: { in: [student1Rut, student2Rut] } }
    }).catch(() => {});
    await prisma.examAssignment.deleteMany({
      where: { assignedTeacherRut: teacherRut }
    }).catch(() => {});
    await prisma.examAudioClip.deleteMany({
      where: { examId: exam?.id }
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

  describe('Audios y Escuchas Adicionales (+1 Escucha)', () => {
    let sub1;
    let sub2;

    beforeAll(async () => {
      // Sub 1: ha reproducido clip1 2 veces (agotado, maxPlays=2) y clip2 1 vez (disponible, maxPlays=3)
      sub1 = await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentRut: student1Rut,
          status: 'IN_PROGRESS',
          audioPlays: JSON.stringify({ [clip1.id]: 2, [clip2.id]: 1 }),
          extraAudioPlays: JSON.stringify({})
        }
      });

      // Sub 2: no ha agotado audios
      sub2 = await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentRut: student2Rut,
          status: 'IN_PROGRESS',
          audioPlays: JSON.stringify({ [clip1.id]: 1, [clip2.id]: 1 }),
          extraAudioPlays: JSON.stringify({})
        }
      });
    });

    test('Monitor en vivo detecta correctamente estudiante con audios agotados', async () => {
      const res = await request(app)
        .get(`/api/teacher/assignments/${assignment.id}/live`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.hasAudios).toBe(true);
      expect(res.body.limitedAudioClipsCount).toBe(2);

      const st1 = res.body.students.find(s => s.rut === student1Rut);
      const st2 = res.body.students.find(s => s.rut === student2Rut);

      expect(st1.hasExhaustedAudios).toBe(true);
      expect(st1.exhaustedAudiosCount).toBe(1);
      expect(st2.hasExhaustedAudios).toBe(false);
    });

    test('Otorgar +1 escucha individual solo incrementa audios que estén efectivamente agotados', async () => {
      const res = await request(app)
        .post(`/api/teacher/assignments/${assignment.id}/students/${student1Rut}/audio-extra-play`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.grantedClipsCount).toBe(1);
      expect(res.body.extraAudioPlays[String(clip1.id)]).toBe(1);
      expect(res.body.extraAudioPlays[String(clip2.id)]).toBeUndefined(); // clip2 no estaba agotado
    });

    test('Rechaza otorgar +1 escucha si el estudiante no tiene audios agotados', async () => {
      // Como clip1 ya tiene +1 extra, su límite efectivo es 2 + 1 = 3, y lleva 2 reproducciones.
      // Por ende, ya no está agotado.
      const res = await request(app)
        .post(`/api/teacher/assignments/${assignment.id}/students/${student1Rut}/audio-extra-play`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no tiene audios con reproducciones agotadas/i);
    });

    test('Estudiante recibe extraAudioPlays actualizados en autoguardado y audio-state', async () => {
      // Enviar autoguardado desde el alumno sincronizando audios
      const resSave = await request(app)
        .put(`/api/student/submissions/${sub1.id}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          answers: [{ questionId: question1.id, selectedAnswer: 'A' }],
          audioPlays: { [String(clip1.id)]: 3 }
        });

      expect(resSave.status).toBe(200);
      expect(resSave.body.extraAudioPlays[String(clip1.id)]).toBe(1);

      // Consultar endpoint dedicado audio-state
      const resState = await request(app)
        .get(`/api/student/assignments/${assignment.id}/audio-state`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(resState.status).toBe(200);
      expect(resState.body.extraAudioPlays[String(clip1.id)]).toBe(1);
      expect(resState.body.audioPlays[String(clip1.id)]).toBe(3);
    });

    test('Otorgar +1 escucha para toda la sala solo beneficia a alumnos con audios agotados', async () => {
      // Ahora student 1 tiene 3 reproducciones de clip 1 (2 + 1 extra = agotado nuevamente)
      // student 2 no ha agotado
      const res = await request(app)
        .post(`/api/teacher/assignments/${assignment.id}/audio-extra-play/room`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.affectedStudentsCount).toBe(1); // Solo benefició a student 1

      const updatedSub1 = await prisma.submission.findUnique({ where: { id: sub1.id } });
      const extras = JSON.parse(updatedSub1.extraAudioPlays || '{}');
      expect(extras[String(clip1.id)]).toBe(2); // Pasó de 1 a 2
    });
  });

  describe('Exclusión Justificada de Estudiantes de Informes y Estadísticas', () => {
    beforeAll(async () => {
      // Marcar ambas entregas con notas:
      // student 1: 100% correctas -> Nota 7.0
      // student 2: 0% correctas -> Nota 1.0
      await prisma.submission.updateMany({
        where: { studentRut: student1Rut, assignmentId: assignment.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          grade: 7.0,
          percent: 100,
          correctCount: 2,
          achievementLevel: 'ADECUADO'
        }
      });

      await prisma.submission.updateMany({
        where: { studentRut: student2Rut, assignmentId: assignment.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          grade: 1.0,
          percent: 0,
          correctCount: 0,
          achievementLevel: 'INSUFICIENTE'
        }
      });
    });

    test('Antes de exclusión: promedio refleja a ambos alumnos (7.0 + 1.0) / 2 = 4.0', async () => {
      const res = await request(app)
        .get(`/api/teacher/assignments/${assignment.id}/summary`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.submittedCount).toBe(2);
      expect(res.body.averageGrade).toBe(4.0);
    });

    test('Rechaza exclusión si no se proporciona una razón obligatoria', async () => {
      const res = await request(app)
        .post(`/api/teacher/assignments/${assignment.id}/students/${student2Rut}/exclude`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ reason: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/razón de la exclusión es obligatoria/i);
    });

    test('Excluye con éxito con motivo justificado y registra detalles', async () => {
      const res = await request(app)
        .post(`/api/teacher/assignments/${assignment.id}/students/${student2Rut}/exclude`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          reason: 'Licencia médica / Justificativo',
          details: 'Presenta certificado médico número 123456 por cuadro febril'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exclusion.reason).toBe('Licencia médica / Justificativo');
    });

    test('Tras exclusión: summary omite al alumno excluido y el promedio sube a 7.0', async () => {
      const res = await request(app)
        .get(`/api/teacher/assignments/${assignment.id}/summary`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.submittedCount).toBe(1);
      expect(res.body.excludedCount).toBe(1);
      expect(res.body.averageGrade).toBe(7.0);
      expect(res.body.averagePercent).toBe(100);
    });

    test('report-data incluye al alumno en excludedStudents y lo omite del cálculo del curso', async () => {
      const res = await request(app)
        .get(`/api/teacher/assignments/${assignment.id}/report-data`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.averageGrade).toBe(7.0);
      expect(res.body.summary.submittedCount).toBe(1);
      expect(res.body.summary.excludedCount).toBe(1);

      expect(res.body.excludedStudents).toHaveLength(1);
      expect(res.body.excludedStudents[0].rut).toBe(student2Rut);
      expect(res.body.excludedStudents[0].reason).toBe('Licencia médica / Justificativo');

      const st2Roster = res.body.students.find(s => s.rut === student2Rut);
      expect(st2Roster.state).toBe('EXCLUIDO');
      expect(st2Roster.grade).toBeNull();
      expect(st2Roster.isExcluded).toBe(true);
    });

    test('Estudiante excluido ve su estado EXCLUDED en el dashboard de alumno', async () => {
      const res = await request(app)
        .get('/api/student/assignments')
        .set('Authorization', `Bearer ${student2Token}`);

      expect(res.status).toBe(200);
      const myAsg = res.body.find(a => a.id === assignment.id);
      expect(myAsg.state).toBe('EXCLUDED');
      expect(myAsg.isExcluded).toBe(true);
      expect(myAsg.exclusionReason).toBe('Licencia médica / Justificativo');
    });

    test('Reintegrar estudiante restaura sus calificaciones y promedios', async () => {
      const resUnexclude = await request(app)
        .post(`/api/teacher/assignments/${assignment.id}/students/${student2Rut}/unexclude`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(resUnexclude.status).toBe(200);
      expect(resUnexclude.body.success).toBe(true);

      const resSummary = await request(app)
        .get(`/api/teacher/assignments/${assignment.id}/summary`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(resSummary.status).toBe(200);
      expect(resSummary.body.submittedCount).toBe(2);
      expect(resSummary.body.averageGrade).toBe(4.0); // Reincorporado correctamente
    });
  });
});
