require('dotenv').config();
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');

describe('Mocktest en vivo desde administración (sin contaminación en BD)', () => {
  const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'));
  const adminToken = signToken({ rut: '11111111-1', role: 'ADMIN', name: 'Admin Mock' });
  const directorToken = signToken({ rut: '22222222-2', role: 'DIRECTOR', name: 'Director Mock' });
  const teacherToken = signToken({ rut: '33333333-3', role: 'TEACHER', name: 'Profesor Mock' });
  const studentToken = signToken({ rut: '44444444-4', role: 'STUDENT', name: 'Estudiante Mock' });

  const mockPdfName = `test-mock-${Date.now()}.pdf`;
  const mockPdfBytes = Buffer.from('%PDF-1.4\n%Mocktest Exam PDF\n%%EOF\n');

  let testExam;
  let mcQ1;
  let mcQ2;
  let writtenQ3;
  let oralQ4;
  let audioClip;

  beforeAll(async () => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadsDir, mockPdfName), mockPdfBytes);

    testExam = await prisma.exam.create({
      data: {
        title: 'Prueba Integral Mocktest',
        subject: 'Inglés',
        level: '4B',
        pdfPath: mockPdfName,
        optionsCount: 4,
        orderNumber: 98,
        examType: 'ENSAYO',
        durationMinutes: 60,
        questions: {
          create: [
            {
              questionNumber: 1,
              questionType: 'MULTIPLE_CHOICE',
              correctAnswer: 'B',
              maxPoints: 1,
              skill: 'Comprensión Lectora',
              axis: 'Lectura'
            },
            {
              questionNumber: 2,
              questionType: 'MULTIPLE_CHOICE',
              correctAnswer: 'D',
              maxPoints: 1,
              skill: 'Comprensión Auditiva',
              axis: 'Listening'
            },
            {
              questionNumber: 3,
              questionType: 'WRITTEN',
              correctAnswer: 'DESARROLLO',
              maxPoints: 5,
              skill: 'Producción Escrita',
              axis: 'Escritura'
            },
            {
              questionNumber: 4,
              questionType: 'ORAL',
              correctAnswer: 'ORAL',
              maxPoints: 4,
              skill: 'Expresión Oral',
              axis: 'Speaking'
            }
          ]
        }
      },
      include: {
        questions: { orderBy: { questionNumber: 'asc' } }
      }
    });

    [mcQ1, mcQ2, writtenQ3, oralQ4] = testExam.questions;

    audioClip = await prisma.examAudioClip.create({
      data: {
        examId: testExam.id,
        title: 'Pista Listening Q2',
        audioPath: 'nonexistent-for-metadata-test.mp3',
        startSec: 5,
        endSec: 25,
        questionNumbers: JSON.stringify([2]),
        maxPlays: 2,
        orderIndex: 1
      }
    });
  });

  afterAll(async () => {
    if (audioClip) {
      await prisma.examAudioClip.delete({ where: { id: audioClip.id } }).catch(() => {});
    }
    if (testExam) {
      await prisma.exam.delete({ where: { id: testExam.id } }).catch(() => {});
    }
    const fullPath = path.join(uploadsDir, mockPdfName);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch {}
    }
    await prisma.$disconnect();
  });

  test('1. Bloquea acceso a STUDENT y TEACHER (403) y permite ADMIN/DIRECTOR sin filtrar clave correcta', async () => {
    const stuRes = await request(app)
      .post(`/api/admin/exams/${testExam.id}/mock-session`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(stuRes.status).toBe(403);

    const teaRes = await request(app)
      .post(`/api/admin/exams/${testExam.id}/mock-session`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(teaRes.status).toBe(403);

    const dirRes = await request(app)
      .post(`/api/admin/exams/${testExam.id}/mock-session`)
      .set('Authorization', `Bearer ${directorToken}`);
    expect(dirRes.status).toBe(200);
    expect(dirRes.body.isMock).toBe(true);

    const admRes = await request(app)
      .post(`/api/admin/exams/${testExam.id}/mock-session`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(admRes.status).toBe(200);
    expect(admRes.body.submissionId).toBe(0);
    expect(admRes.body.assignmentId).toBe(0);
    expect(admRes.body.mockStudent).toBeDefined();
    expect(admRes.body.mockStudent.name).toContain('Mocktest');
    expect(admRes.body.exam.hasPdfFile).toBe(true);
    expect(admRes.body.exam.pdfVersion).toBe(mockPdfName);
    expect(Array.isArray(admRes.body.audioClips)).toBe(true);
    expect(admRes.body.audioClips[0].questionNumbers).toEqual([2]);
    expect(admRes.body.questions).toHaveLength(4);

    // No debe exponer correctAnswer en el payload de sesión simulada
    for (const q of admRes.body.questions) {
      expect(q.correctAnswer).toBeUndefined();
    }
  });

  test('2. Evalúa respuestas simuladas con motor real (MC + desarrollo + oral) sin tocar la base de datos', async () => {
    const beforeCounts = {
      users: await prisma.user.count(),
      courses: await prisma.course.count(),
      assignments: await prisma.examAssignment.count(),
      submissions: await prisma.submission.count(),
      answers: await prisma.submissionAnswer.count()
    };

    // Sin puntaje simulado para preguntas abiertas: solo MC correctas suman (Q1=B correcta, Q2=A incorrecta)
    const gradeRes1 = await request(app)
      .post(`/api/admin/exams/${testExam.id}/mock-grade`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        answers: {
          [mcQ1.id]: 'b',
          [mcQ2.id]: 'A',
          [writtenQ3.id]: 'Respuesta escrita de prueba del estudiante simulado.'
        }
      });

    expect(gradeRes1.status).toBe(200);
    expect(gradeRes1.body.isMock).toBe(true);
    expect(gradeRes1.body.maxPoints).toBe(11);
    expect(gradeRes1.body.earnedPoints).toBe(1);
    expect(gradeRes1.body.simceScore).toBeGreaterThanOrEqual(100);
    expect(Array.isArray(gradeRes1.body.bySkill)).toBe(true);
    expect(Array.isArray(gradeRes1.body.byAxis)).toBe(true);

    const q1Audit = gradeRes1.body.perQuestion.find((p) => p.questionId === mcQ1.id);
    const q2Audit = gradeRes1.body.perQuestion.find((p) => p.questionId === mcQ2.id);
    const q3Audit = gradeRes1.body.perQuestion.find((p) => p.questionId === writtenQ3.id);
    expect(q1Audit.isCorrect).toBe(true);
    expect(q1Audit.correctAnswer).toBe('B');
    expect(q2Audit.isCorrect).toBe(false);
    expect(q2Audit.correctAnswer).toBe('D');
    expect(q3Audit.selected).toContain('Respuesta escrita de prueba');
    expect(q3Audit.awardedPoints).toBeNull();

    // Con puntaje simulado en desarrollo y oral (también validando tope maxPoints)
    const gradeRes2 = await request(app)
      .post(`/api/admin/exams/${testExam.id}/mock-grade`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        answers: {
          [mcQ1.id]: 'B',
          [mcQ2.id]: 'D',
          [writtenQ3.id]: 'Desarrollo completo.'
        },
        awardedPoints: {
          [writtenQ3.id]: 99, // debe acotarse al máximo 5
          [oralQ4.id]: 4
        }
      });

    expect(gradeRes2.status).toBe(200);
    expect(gradeRes2.body.earnedPoints).toBe(11);
    expect(gradeRes2.body.percent).toBe(100);
    expect(gradeRes2.body.grade).toBe(7);

    // Confirmar invariante de cero escrituras en base de datos
    const afterCounts = {
      users: await prisma.user.count(),
      courses: await prisma.course.count(),
      assignments: await prisma.examAssignment.count(),
      submissions: await prisma.submission.count(),
      answers: await prisma.submissionAnswer.count()
    };
    expect(afterCounts).toEqual(beforeCounts);
  });
});
