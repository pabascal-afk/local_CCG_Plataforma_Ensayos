require('dotenv').config();
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { signToken } = require('../src/middleware/auth');

describe('Reemplazo / Asignación de nuevo PDF en pruebas y ensayos', () => {
  const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'));
  const adminToken = signToken({ rut: '11111111-1', role: 'ADMIN', name: 'Admin Test' });
  const directorToken = signToken({ rut: '22222222-2', role: 'DIRECTOR', name: 'Director Test' });
  const testStudentRut = '19999888-7';
  const studentToken = signToken({ rut: testStudentRut, role: 'STUDENT', name: 'Estudiante PDF Test' });

  const initialPdfName = `test-initial-${Date.now()}.pdf`;
  const initialPdfBytes = Buffer.from('%PDF-1.4\n%Initial PDF Test Document\n%%EOF\n');
  const replacementPdfBytes = Buffer.from('%PDF-1.7\n%Replaced PDF Test Document v2\n%%EOF\n');
  const secondReplacementPdfBytes = Buffer.from('%PDF-1.7\n%Replaced PDF Test Document v3\n%%EOF\n');

  let testCourse;
  let testExam;
  let testAssignment;
  const createdUploadFiles = new Set([initialPdfName]);

  beforeAll(async () => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadsDir, initialPdfName), initialPdfBytes);

    testCourse = await prisma.course.upsert({
      where: { level_letter_year: { level: '4B', letter: 'Z', year: 2099 } },
      update: {},
      create: { level: '4B', letter: 'Z', year: 2099 }
    });

    const hash = await bcrypt.hash('test1234', 10);
    await prisma.user.upsert({
      where: { rut: testStudentRut },
      update: { courseId: testCourse.id, role: 'STUDENT', isActive: true },
      create: {
        rut: testStudentRut,
        name: 'Estudiante PDF Test',
        role: 'STUDENT',
        courseId: testCourse.id,
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true
      }
    });

    testExam = await prisma.exam.create({
      data: {
        title: 'Prueba PDF Replace Test',
        subject: 'Matemática',
        level: '4B',
        pdfPath: initialPdfName,
        optionsCount: 4,
        orderNumber: 99,
        examType: 'ENSAYO'
      }
    });

    const now = new Date();
    testAssignment = await prisma.examAssignment.create({
      data: {
        examId: testExam.id,
        courseId: testCourse.id,
        opensAt: new Date(now.getTime() - 10 * 60 * 1000),
        closesAt: new Date(now.getTime() + 60 * 60 * 1000),
        applicationMode: 'DIGITAL',
        status: 'ONGOING'
      }
    });
  });

  afterAll(async () => {
    if (testAssignment) {
      await prisma.examAssignment.delete({ where: { id: testAssignment.id } }).catch(() => {});
    }
    if (testExam) {
      const latestExam = await prisma.exam.findUnique({ where: { id: testExam.id } }).catch(() => null);
      if (latestExam?.pdfPath) createdUploadFiles.add(path.basename(latestExam.pdfPath));
      await prisma.exam.delete({ where: { id: testExam.id } }).catch(() => {});
    }
    await prisma.user.delete({ where: { rut: testStudentRut } }).catch(() => {});
    if (testCourse) {
      await prisma.course.delete({ where: { id: testCourse.id } }).catch(() => {});
    }

    for (const filename of createdUploadFiles) {
      const fullPath = path.join(uploadsDir, path.basename(filename));
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch {}
      }
    }
    await prisma.$disconnect();
  });

  test('1. Impide reemplazar PDF a usuarios no ADMIN (403) y mantiene PDF original', async () => {
    const res = await request(app)
      .put(`/api/admin/exams/${testExam.id}/pdf`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('pdf', replacementPdfBytes, 'nuevo.pdf');

    expect(res.status).toBe(403);
    const examDb = await prisma.exam.findUnique({ where: { id: testExam.id } });
    expect(examDb.pdfPath).toBe(initialPdfName);
    expect(fs.existsSync(path.join(uploadsDir, initialPdfName))).toBe(true);
  });

  test('2. Rechaza archivos que no son PDF reales (ej: texto renombrado .pdf) y limpia archivo temporal', async () => {
    const filesBefore = new Set(fs.readdirSync(uploadsDir));

    const res = await request(app)
      .put(`/api/admin/exams/${testExam.id}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('pdf', Buffer.from('Este archivo no es un PDF real'), 'falso.pdf');

    expect(res.status).toBe(400);
    const filesAfter = fs.readdirSync(uploadsDir);
    expect(filesAfter.length).toBe(filesBefore.size);

    const examDb = await prisma.exam.findUnique({ where: { id: testExam.id } });
    expect(examDb.pdfPath).toBe(initialPdfName);
  });

  test('3. PUT /api/admin/exams/:id/pdf asigna nuevo PDF, elimina el anterior y actualiza metadatos', async () => {
    const res = await request(app)
      .put(`/api/admin/exams/${testExam.id}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('pdf', replacementPdfBytes, 'cuadernillo_corregido.pdf');

    expect(res.status).toBe(200);
    expect(res.body.exam).toBeDefined();
    expect(res.body.exam.hasPdfFile).toBe(true);
    expect(res.body.exam.pdfFileSize).toBe(replacementPdfBytes.length);

    const newPdfName = res.body.exam.pdfPath;
    expect(newPdfName).toBeTruthy();
    expect(newPdfName).not.toBe(initialPdfName);
    createdUploadFiles.add(newPdfName);

    // El archivo antiguo se eliminó del disco y el nuevo existe
    expect(fs.existsSync(path.join(uploadsDir, initialPdfName))).toBe(false);
    expect(fs.existsSync(path.join(uploadsDir, newPdfName))).toBe(true);

    // El endpoint /api/admin/exams/:id expone hasPdfFile y pdfFileSize actualizados
    const detailRes = await request(app)
      .get(`/api/admin/exams/${testExam.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.pdfPath).toBe(newPdfName);
    expect(detailRes.body.hasPdfFile).toBe(true);
    expect(detailRes.body.pdfFileSize).toBe(replacementPdfBytes.length);

    // El endpoint /api/exams/:id/pdf sirve el nuevo contenido sin caché obsoleta
    const staffPdfRes = await request(app)
      .get(`/api/exams/${testExam.id}/pdf`)
      .set('Authorization', `Bearer ${directorToken}`)
      .buffer(true)
      .parse((resStream, cb) => {
        const chunks = [];
        resStream.on('data', (c) => chunks.push(c));
        resStream.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(staffPdfRes.status).toBe(200);
    expect(staffPdfRes.headers['cache-control']).toContain('no-cache');
    expect(Buffer.compare(staffPdfRes.body, replacementPdfBytes)).toBe(0);
  });

  test('4. POST /api/admin/exams/:id/pdf también funciona y el estudiante recibe el PDF actualizado y pdfVersion', async () => {
    const res = await request(app)
      .post(`/api/admin/exams/${testExam.id}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('pdf', secondReplacementPdfBytes, 'cuadernillo_v3.pdf');

    expect(res.status).toBe(200);
    const v3Name = res.body.exam.pdfPath;
    createdUploadFiles.add(v3Name);

    const startRes = await request(app)
      .post(`/api/student/assignments/${testAssignment.id}/start`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});

    expect(startRes.status).toBe(200);
    expect(startRes.body.exam.pdfVersion).toBe(v3Name);

    const studentPdfRes = await request(app)
      .get(`/api/student/assignments/${testAssignment.id}/pdf?v=${encodeURIComponent(v3Name)}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .buffer(true)
      .parse((resStream, cb) => {
        const chunks = [];
        resStream.on('data', (c) => chunks.push(c));
        resStream.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(studentPdfRes.status).toBe(200);
    expect(studentPdfRes.headers['cache-control']).toContain('no-cache');
    expect(Buffer.compare(studentPdfRes.body, secondReplacementPdfBytes)).toBe(0);
  });
});
