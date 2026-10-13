/* eslint-disable no-console */
/**
 * Script de Limpieza y Carga de Datos de Demostración Completo (Seed).
 * Incluye:
 * - Años 2026 y 2025 para Trayectoria Multianual.
 * - Cursos: 4°B A/B, 6°B A, 8°B A, 2°M A/B.
 * - Usuarios con RUT chileno válido: Administrador/UTP, Directora, Profesores y Estudiantes.
 * - Evaluaciones de tipo ENSAYO, QUIZ, REMEDIAL y DIAGNÓSTICO con pautas completas (OA, Eje, Habilidad, TRI).
 * - Rendiciones históricas completas con descensos identificables.
 * - Flujo híbrido de Remediales: Propuestas pendientes para UTP, propuestas aprobadas con medición de impacto, y ALERTA en pruebas sin remedial.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { computeDv } = require('../src/utils/rut');
const { chileanGrade } = require('../src/services/grading');

const prisma = new PrismaClient();
const rutFromBody = (body) => `${body}-${computeDv(String(body))}`;

async function main() {
  console.log('--- 1. Limpiando base de datos previa ---');
  await prisma.submissionAnswer.deleteMany({});
  await prisma.submission.deleteMany({});
  await prisma.remedialProposal.deleteMany({});
  await prisma.examAssignment.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.exam.deleteMany({});
  await prisma.simceMilestone.deleteMany({});
  await prisma.teacherCourse.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.course.deleteMany({});

  console.log('Base de datos vaciada con éxito.');

  console.log('--- 2. Creando Cursos (2026 y 2025) ---');
  const courseData = [
    { level: '4B', letter: 'A', year: 2026 },
    { level: '4B', letter: 'B', year: 2026 },
    { level: '6B', letter: 'A', year: 2026 },
    { level: '8B', letter: 'A', year: 2026 },
    { level: '2M', letter: 'A', year: 2026 },
    { level: '2M', letter: 'B', year: 2026 },
    // Año 2025 para comparativas históricas multianuales
    { level: '4B', letter: 'A', year: 2025 },
    { level: '2M', letter: 'A', year: 2025 },
  ];

  const courses = {};
  for (const c of courseData) {
    const created = await prisma.course.create({ data: c });
    courses[`${c.level}_${c.letter}_${c.year}`] = created;
  }

  console.log('--- 3. Creando Usuarios del Sistema ---');
  const defaultPw = await bcrypt.hash('simce123', 10);

  // Administrador / UTP
  const adminRut = rutFromBody(11111111);
  const adminUser = await prisma.user.create({
    data: {
      rut: adminRut,
      name: 'Camila Sepúlveda (UTP / Admin)',
      role: 'ADMIN',
      passwordHash: defaultPw,
      mustChangePassword: false,
    }
  });

  // Directora
  const directorRut = rutFromBody(33333333);
  await prisma.user.create({
    data: {
      rut: directorRut,
      name: 'Beatriz Morales (Directora)',
      role: 'DIRECTOR',
      passwordHash: defaultPw,
      mustChangePassword: false,
    }
  });

  // Profesores
  const teachers = [
    { rut: rutFromBody(15555555), name: 'Profesor Carlos Valenzuela', subject: 'Matemática' },
    { rut: rutFromBody(16666666), name: 'Profesora Marcela Contreras', subject: 'Lectura' },
    { rut: rutFromBody(17777777), name: 'Profesor Rodrigo Soto', subject: 'Ciencias' },
  ];

  for (const t of teachers) {
    await prisma.user.create({
      data: {
        rut: t.rut,
        name: t.name,
        role: 'TEACHER',
        passwordHash: defaultPw,
        mustChangePassword: false,
      }
    });
  }

  // Asignar profesores a cursos
  await prisma.teacherCourse.createMany({
    data: [
      { teacherRut: teachers[0].rut, courseId: courses['4B_A_2026'].id },
      { teacherRut: teachers[0].rut, courseId: courses['4B_B_2026'].id },
      { teacherRut: teachers[0].rut, courseId: courses['2M_A_2026'].id },
      { teacherRut: teachers[1].rut, courseId: courses['4B_A_2026'].id },
      { teacherRut: teachers[1].rut, courseId: courses['2M_A_2026'].id },
      { teacherRut: teachers[2].rut, courseId: courses['6B_A_2026'].id },
      { teacherRut: teachers[2].rut, courseId: courses['8B_A_2026'].id },
    ]
  });

  // Estudiantes
  console.log('--- 4. Creando Estudiantes ---');
  const studentNames = [
    'Martina Soto', 'Benjamín Rojas', 'Sofía Muñoz', 'Agustín Díaz', 'Florencia Pérez',
    'Lucas Silva', 'Valentina Araya', 'Mateo Castro', 'Isidora Gómez', 'Vicente Morales'
  ];

  const studentsByCourse = {};
  let bodyCounter = 21000000;

  for (const courseKey of ['4B_A_2026', '4B_B_2026', '2M_A_2026', '2M_B_2026', '4B_A_2025', '2M_A_2025']) {
    studentsByCourse[courseKey] = [];
    for (let i = 0; i < 6; i++) {
      bodyCounter++;
      const sRut = rutFromBody(bodyCounter);
      const student = await prisma.user.create({
        data: {
          rut: sRut,
          name: `${studentNames[i]} (${courses[courseKey].level} ${courses[courseKey].letter})`,
          role: 'STUDENT',
          passwordHash: defaultPw,
          courseId: courses[courseKey].id,
          mustChangePassword: false,
        }
      });
      studentsByCourse[courseKey].push(student);
    }
  }

  console.log('--- 5. Creando Catálogo de Evaluaciones (Ensayos, Quizes y Remediales) ---');

  // Función helper para crear preguntas con OAs y TRI
  const makeQuestions = (count, subject) => {
    const oasMath = ['OA 1 (Números y Operaciones)', 'OA 3 (Fracciones y Decimales)', 'OA 5 (Patrones y Álgebra)', 'OA 7 (Geometría y Medición)'];
    const axesMath = ['Números', 'Álgebra', 'Geometría', 'Medición'];
    const skillsMath = ['Resolver problemas', 'Modelar', 'Representar', 'Argumentar'];

    const oasLang = ['OA 2 (Comprensión Lectora Narrativa)', 'OA 4 (Textos Informativos)', 'OA 6 (Vocabulario en Contexto)'];
    const axesLang = ['Lectura', 'Escritura', 'Comunicación Oral'];
    const skillsLang = ['Localizar información', 'Interpretar y relacionar', 'Reflexionar sobre el texto'];

    const oas = subject === 'Lectura' ? oasLang : oasMath;
    const axes = subject === 'Lectura' ? axesLang : axesMath;
    const skills = subject === 'Lectura' ? skillsLang : skillsMath;

    const letters = ['A', 'B', 'C', 'D'];
    return Array.from({ length: count }, (_, i) => ({
      questionNumber: i + 1,
      correctAnswer: letters[i % 4],
      skill: skills[i % skills.length],
      axis: axes[i % axes.length],
      learningObjective: oas[i % oas.length],
      difficulty: Number((-1.5 + (i * 3.0 / count)).toFixed(2)),
      discrimination: Number((0.8 + (i % 3) * 0.4).toFixed(2)),
      guessing: 0.25,
    }));
  };

  // 1. Ensayo SIMCE Matemática N°1 - 4° Básico
  const exam4B_Mat1 = await prisma.exam.create({
    data: {
      title: 'Ensayo SIMCE Matemática N°1 - 4° Básico',
      subject: 'Matematica',
      level: '4B',
      examType: 'ENSAYO',
      orderNumber: 1,
      durationMinutes: 90,
      pdfPath: 'ensayo-simce-mat-4b-1.pdf',
      optionsCount: 4,
      questions: { create: makeQuestions(24, 'Matematica') }
    }
  });

  // 2. Ensayo SIMCE Matemática N°2 - 4° Básico
  const exam4B_Mat2 = await prisma.exam.create({
    data: {
      title: 'Ensayo SIMCE Matemática N°2 - 4° Básico',
      subject: 'Matematica',
      level: '4B',
      examType: 'ENSAYO',
      orderNumber: 2,
      durationMinutes: 90,
      pdfPath: 'ensayo-simce-mat-4b-2.pdf',
      optionsCount: 4,
      questions: { create: makeQuestions(24, 'Matematica') }
    }
  });

  // 3. Quiz Remedial: Fracciones y Operaciones - 4° Básico
  const exam4B_Remedial = await prisma.exam.create({
    data: {
      title: 'Quiz Remedial: Fracciones y Operaciones - 4° Básico',
      subject: 'Matematica',
      level: '4B',
      examType: 'REMEDIAL',
      orderNumber: 1,
      durationMinutes: 45,
      pdfPath: 'remedial-mat-4b.pdf',
      optionsCount: 4,
      questions: {
        create: Array.from({ length: 12 }, (_, i) => ({
          questionNumber: i + 1,
          correctAnswer: ['A', 'B', 'C', 'D'][i % 4],
          skill: 'Resolver problemas',
          axis: 'Números',
          learningObjective: 'OA 3 (Fracciones y Decimales)',
          difficulty: 0.1,
          discrimination: 1.2,
          guessing: 0.25,
        }))
      }
    }
  });

  // 4. Ensayo SIMCE Lenguaje N°1 - 4° Básico
  const exam4B_Leng1 = await prisma.exam.create({
    data: {
      title: 'Ensayo SIMCE Lenguaje N°1 - 4° Básico',
      subject: 'Lectura',
      level: '4B',
      examType: 'ENSAYO',
      orderNumber: 1,
      durationMinutes: 90,
      pdfPath: 'ensayo-simce-leng-4b-1.pdf',
      optionsCount: 4,
      questions: { create: makeQuestions(24, 'Lectura') }
    }
  });

  // 5. Ensayo SIMCE Matemática N°1 - 2° Medio
  const exam2M_Mat1 = await prisma.exam.create({
    data: {
      title: 'Ensayo SIMCE Matemática N°1 - 2° Medio',
      subject: 'Matematica',
      level: '2M',
      examType: 'ENSAYO',
      orderNumber: 1,
      durationMinutes: 90,
      pdfPath: 'ensayo-simce-mat-2m-1.pdf',
      optionsCount: 4,
      questions: { create: makeQuestions(30, 'Matematica') }
    }
  });

  // 6. Ensayo SIMCE Matemática N°2 - 2° Medio
  const exam2M_Mat2 = await prisma.exam.create({
    data: {
      title: 'Ensayo SIMCE Matemática N°2 - 2° Medio',
      subject: 'Matematica',
      level: '2M',
      examType: 'ENSAYO',
      orderNumber: 2,
      durationMinutes: 90,
      pdfPath: 'ensayo-simce-mat-2m-2.pdf',
      optionsCount: 4,
      questions: { create: makeQuestions(30, 'Matematica') }
    }
  });

  // 7. Quiz Remedial: Álgebra y Ecuaciones - 2° Medio
  const exam2M_Remedial = await prisma.exam.create({
    data: {
      title: 'Quiz Remedial: Álgebra y Ecuaciones - 2° Medio',
      subject: 'Matematica',
      level: '2M',
      examType: 'REMEDIAL',
      orderNumber: 1,
      durationMinutes: 45,
      pdfPath: 'remedial-mat-2m.pdf',
      optionsCount: 4,
      questions: {
        create: Array.from({ length: 12 }, (_, i) => ({
          questionNumber: i + 1,
          correctAnswer: ['B', 'C', 'A', 'D'][i % 4],
          skill: 'Modelar',
          axis: 'Álgebra',
          learningObjective: 'OA 5 (Patrones y Álgebra)',
          difficulty: 0.3,
          discrimination: 1.1,
          guessing: 0.25,
        }))
      }
    }
  });

  // 8. Diagnóstico Inicial Ciencias - 6° Básico
  const exam6B_Ciencias = await prisma.exam.create({
    data: {
      title: 'Diagnóstico Inicial Ciencias Naturales - 6° Básico',
      subject: 'Ciencias Naturales',
      level: '6B',
      examType: 'DIAGNOSTICO',
      orderNumber: 1,
      durationMinutes: 60,
      pdfPath: 'diag-ciencias-6b.pdf',
      optionsCount: 4,
      questions: { create: makeQuestions(20, 'Ciencias Naturales') }
    }
  });

  console.log('--- 6. Creando Asignaciones y Rendiciones de Prueba ---');
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  // CASO A: 4° Básico A 2026 - Ensayo Matemática #1 (RENDIDO)
  // Estado: El profesor ya propuso fecha para remedial ante UTP (PENDING)
  const asg4B_A = await prisma.examAssignment.create({
    data: {
      examId: exam4B_Mat1.id,
      courseId: courses['4B_A_2026'].id,
      opensAt: new Date(now.getTime() - 7 * day),
      closesAt: new Date(now.getTime() - 5 * day),
      status: 'COMPLETED',
      assignedTeacherRut: teachers[0].rut,
      released: true,
      releasedAt: new Date(now.getTime() - 4 * day),
      releasedBy: teachers[0].rut,
    }
  });

  // Crear submissions de 4°A
  const questions4B = await prisma.question.findMany({ where: { examId: exam4B_Mat1.id }, orderBy: { questionNumber: 'asc' } });
  for (let idx = 0; idx < studentsByCourse['4B_A_2026'].length; idx++) {
    const st = studentsByCourse['4B_A_2026'][idx];
    const correctCount = 12 + idx * 2; // entre 12 y 22 de 24
    const percent = Math.round((correctCount / 24) * 100);
    const grade = chileanGrade(correctCount / 24, 0.6, 1.0);
    const simceScore = 230 + idx * 12; // 230 a 290
    const achievementLevel = simceScore < 241 ? 'INSUFICIENTE' : (simceScore < 284 ? 'ELEMENTAL' : 'ADECUADO');

    const sub = await prisma.submission.create({
      data: {
        studentRut: st.rut,
        assignmentId: asg4B_A.id,
        status: 'SUBMITTED',
        startedAt: new Date(now.getTime() - 6 * day),
        submittedAt: new Date(now.getTime() - 6 * day + 65 * 60 * 1000),
        correctCount,
        percent,
        grade,
        simceScore,
        achievementLevel,
      }
    });

    // Respuestas detalladas
    const answersData = questions4B.map((q, qIdx) => ({
      submissionId: sub.id,
      questionId: q.id,
      selectedAnswer: qIdx < correctCount ? q.correctAnswer : (q.correctAnswer === 'A' ? 'B' : 'A'),
      isCorrect: qIdx < correctCount,
    }));
    await prisma.submissionAnswer.createMany({ data: answersData });
  }

  // PROPUESTA REMEDIAL EN 'PENDING' para 4°A
  await prisma.remedialProposal.create({
    data: {
      originAssignmentId: asg4B_A.id,
      courseId: courses['4B_A_2026'].id,
      teacherRut: teachers[0].rut,
      remedialExamId: exam4B_Remedial.id,
      suggestedDate: new Date(now.getTime() + 2 * day),
      startTime: '08:30',
      endTime: '09:30',
      notes: 'Solicito autorización de UTP para aplicar este Quiz Remedial enfocado en OA 3 (Fracciones y Decimales) donde el 60% del curso estuvo bajo 50%.',
      status: 'PENDING',
    }
  });

  // CASO B: 4° Básico B 2026 - Ensayo Matemática #1 (RENDIDO)
  // Estado: ¡ALERTA! Rendido pero NO tiene remedial propuesta ni programada
  const asg4B_B = await prisma.examAssignment.create({
    data: {
      examId: exam4B_Mat1.id,
      courseId: courses['4B_B_2026'].id,
      opensAt: new Date(now.getTime() - 4 * day),
      closesAt: new Date(now.getTime() - 2 * day),
      status: 'COMPLETED',
      assignedTeacherRut: teachers[0].rut,
      released: true,
    }
  });

  for (let idx = 0; idx < studentsByCourse['4B_B_2026'].length; idx++) {
    const st = studentsByCourse['4B_B_2026'][idx];
    const correctCount = 10 + idx * 2;
    const percent = Math.round((correctCount / 24) * 100);
    const grade = chileanGrade(correctCount / 24, 0.6, 1.0);
    const simceScore = 225 + idx * 10;
    const achievementLevel = simceScore < 241 ? 'INSUFICIENTE' : (simceScore < 284 ? 'ELEMENTAL' : 'ADECUADO');

    const sub = await prisma.submission.create({
      data: {
        studentRut: st.rut,
        assignmentId: asg4B_B.id,
        status: 'SUBMITTED',
        startedAt: new Date(now.getTime() - 3 * day),
        submittedAt: new Date(now.getTime() - 3 * day + 70 * 60 * 1000),
        correctCount,
        percent,
        grade,
        simceScore,
        achievementLevel,
      }
    });

    const answersData = questions4B.map((q, qIdx) => ({
      submissionId: sub.id,
      questionId: q.id,
      selectedAnswer: qIdx < correctCount ? q.correctAnswer : 'C',
      isCorrect: qIdx < correctCount,
    }));
    await prisma.submissionAnswer.createMany({ data: answersData });
  }

  // CASO C: 2° Medio A 2026 - Ensayo Matemática #1 (RENDIDO) + Remedial APROBADA y RENDIDA (Impacto Positivo)
  const asg2M_A = await prisma.examAssignment.create({
    data: {
      examId: exam2M_Mat1.id,
      courseId: courses['2M_A_2026'].id,
      opensAt: new Date(now.getTime() - 14 * day),
      closesAt: new Date(now.getTime() - 12 * day),
      status: 'COMPLETED',
      assignedTeacherRut: teachers[0].rut,
      released: true,
    }
  });

  const questions2M = await prisma.question.findMany({ where: { examId: exam2M_Mat1.id }, orderBy: { questionNumber: 'asc' } });
  for (let idx = 0; idx < studentsByCourse['2M_A_2026'].length; idx++) {
    const st = studentsByCourse['2M_A_2026'][idx];
    const correctCount = 14 + idx * 2;
    const percent = Math.round((correctCount / 30) * 100);
    const grade = chileanGrade(correctCount / 30, 0.6, 1.0);
    const simceScore = 240 + idx * 10;
    const achievementLevel = simceScore < 241 ? 'INSUFICIENTE' : (simceScore < 284 ? 'ELEMENTAL' : 'ADECUADO');

    const sub = await prisma.submission.create({
      data: {
        studentRut: st.rut,
        assignmentId: asg2M_A.id,
        status: 'SUBMITTED',
        startedAt: new Date(now.getTime() - 13 * day),
        submittedAt: new Date(now.getTime() - 13 * day + 80 * 60 * 1000),
        correctCount,
        percent,
        grade,
        simceScore,
        achievementLevel,
      }
    });

    const answersData = questions2M.map((q, qIdx) => ({
      submissionId: sub.id,
      questionId: q.id,
      selectedAnswer: qIdx < correctCount ? q.correctAnswer : 'A',
      isCorrect: qIdx < correctCount,
    }));
    await prisma.submissionAnswer.createMany({ data: answersData });
  }

  // Remedial formal aprobada y rendida para 2° Medio A
  const asg2M_Remedial = await prisma.examAssignment.create({
    data: {
      examId: exam2M_Remedial.id,
      courseId: courses['2M_A_2026'].id,
      opensAt: new Date(now.getTime() - 6 * day),
      closesAt: new Date(now.getTime() - 4 * day),
      status: 'COMPLETED',
      assignedTeacherRut: teachers[0].rut,
      remedialOriginId: asg2M_A.id,
      released: true,
    }
  });

  await prisma.remedialProposal.create({
    data: {
      originAssignmentId: asg2M_A.id,
      courseId: courses['2M_A_2026'].id,
      teacherRut: teachers[0].rut,
      remedialExamId: exam2M_Remedial.id,
      suggestedDate: new Date(now.getTime() - 6 * day),
      startTime: '08:30',
      endTime: '09:30',
      notes: 'Remedial de Álgebra aplicada tras resultados descendidos.',
      status: 'APPROVED',
      reviewedByRut: adminRut,
      reviewNotes: 'Aprobado formalmente por UTP.',
      createdAssignmentId: asg2M_Remedial.id,
    }
  });

  const questionsRem2M = await prisma.question.findMany({ where: { examId: exam2M_Remedial.id } });
  for (let idx = 0; idx < studentsByCourse['2M_A_2026'].length; idx++) {
    const st = studentsByCourse['2M_A_2026'][idx];
    const correctCount = 9 + idx; // Notoria mejora en los 12 items de remedial
    const percent = Math.round((correctCount / 12) * 100);
    const grade = chileanGrade(correctCount / 12, 0.6, 1.0);

    const sub = await prisma.submission.create({
      data: {
        studentRut: st.rut,
        assignmentId: asg2M_Remedial.id,
        status: 'SUBMITTED',
        startedAt: new Date(now.getTime() - 5 * day),
        submittedAt: new Date(now.getTime() - 5 * day + 35 * 60 * 1000),
        correctCount,
        percent,
        grade,
        simceScore: 275 + idx * 5,
        achievementLevel: 'ADECUADO',
      }
    });

    const answersData = questionsRem2M.map((q, qIdx) => ({
      submissionId: sub.id,
      questionId: q.id,
      selectedAnswer: qIdx < correctCount ? q.correctAnswer : 'D',
      isCorrect: qIdx < correctCount,
    }));
    await prisma.submissionAnswer.createMany({ data: answersData });
  }

  // CASO D: Asignaciones ACTIVAS para HOY y PRÓXIMAS (Para probar agendamiento, PIN, Drag & Drop)
  await prisma.examAssignment.create({
    data: {
      examId: exam4B_Leng1.id,
      courseId: courses['4B_A_2026'].id,
      opensAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0),
      closesAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0),
      status: 'ONGOING',
      assignedTeacherRut: teachers[1].rut,
      dynamicPassword: 'SIMCE4ALENG',
      dynamicPasswordActive: true,
    }
  });

  await prisma.examAssignment.create({
    data: {
      examId: exam6B_Ciencias.id,
      courseId: courses['6B_A_2026'].id,
      opensAt: new Date(now.getTime() + 2 * day),
      closesAt: new Date(now.getTime() + 2 * day + 4 * 60 * 60 * 1000),
      status: 'SCHEDULED',
      assignedTeacherRut: teachers[2].rut,
    }
  });

  // CASO E: Datos Históricos 2025 para Trayectoria Multianual
  const asg4B_2025 = await prisma.examAssignment.create({
    data: {
      examId: exam4B_Mat1.id,
      courseId: courses['4B_A_2025'].id,
      opensAt: new Date('2025-10-15T08:30:00.000Z'),
      closesAt: new Date('2025-10-15T18:00:00.000Z'),
      status: 'COMPLETED',
      released: true,
    }
  });

  for (let idx = 0; idx < studentsByCourse['4B_A_2025'].length; idx++) {
    const st = studentsByCourse['4B_A_2025'][idx];
    const simceScore = 245 + idx * 8; // Promedio ~265 pts en 2025
    await prisma.submission.create({
      data: {
        studentRut: st.rut,
        assignmentId: asg4B_2025.id,
        status: 'SUBMITTED',
        startedAt: new Date('2025-10-15T09:00:00.000Z'),
        submittedAt: new Date('2025-10-15T10:20:00.000Z'),
        correctCount: 14 + idx,
        percent: 60 + idx * 5,
        grade: 4.8 + idx * 0.3,
        simceScore,
        achievementLevel: simceScore < 241 ? 'INSUFICIENTE' : (simceScore < 284 ? 'ELEMENTAL' : 'ADECUADO'),
      }
    });
  }

  // Hitos Oficiales SIMCE para el calendario
  await prisma.simceMilestone.createMany({
    data: [
      { title: 'Aplicación Oficial SIMCE 4° Básico', level: '4B', year: 2026, date: new Date(2026, 10, 18), notes: 'Matemática y Lectura' },
      { title: 'Aplicación Oficial SIMCE 2° Medio', level: '2M', year: 2026, date: new Date(2026, 10, 25), notes: 'Matemática y Lenguaje' },
    ]
  });

  console.log('\n=============================================');
  console.log('✅ Base de datos recreada y poblada exitosamente!');
  console.log('Credenciales de acceso rápido (Contraseña común: simce123):');
  console.table([
    { Rol: 'ADMIN / UTP', Nombre: adminUser.name, RUT: adminUser.rut, Clave: 'simce123' },
    { Rol: 'DIRECTORA', Nombre: 'Beatriz Morales', RUT: directorRut, Clave: 'simce123' },
    { Rol: 'DOCENTE MATEMÁTICA', Nombre: teachers[0].name, RUT: teachers[0].rut, Clave: 'simce123' },
    { Rol: 'DOCENTE LECTURA', Nombre: teachers[1].name, RUT: teachers[1].rut, Clave: 'simce123' },
    { Rol: 'ALUMNO 4°A', Nombre: studentsByCourse['4B_A_2026'][0].name, RUT: studentsByCourse['4B_A_2026'][0].rut, Clave: 'simce123' },
    { Rol: 'ALUMNO 2°M A', Nombre: studentsByCourse['2M_A_2026'][0].name, RUT: studentsByCourse['2M_A_2026'][0].rut, Clave: 'simce123' },
  ]);
  console.log('=============================================\n');
}

main()
  .catch((e) => {
    console.error('Error durante el seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
