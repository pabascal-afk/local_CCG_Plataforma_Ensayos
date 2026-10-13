const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { computeResults } = require('./src/services/grading');
const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando generación de datos longitudinales (Marzo, Junio, Octubre)...");

  // 1. Curso 4B A
  const course = await prisma.course.upsert({
    where: { level_letter_year: { level: '4B', letter: 'A', year: 2026 } },
    update: {},
    create: { level: '4B', letter: 'A', year: 2026 }
  });

  // 2. Profesor
  const profHash = await bcrypt.hash('1234', 10);
  const teacherRut = '99999999-9';
  const teacher = await prisma.user.upsert({
    where: { rut: teacherRut },
    update: { role: 'TEACHER', passwordHash: profHash },
    create: {
      rut: teacherRut,
      passwordHash: profHash,
      role: 'TEACHER',
      name: 'Profesor Remedial y Trayectoria',
      mustChangePassword: false
    }
  });

  await prisma.teacherCourse.upsert({
    where: { teacherRut_courseId: { teacherRut: teacher.rut, courseId: course.id } },
    update: {},
    create: { teacherRut: teacher.rut, courseId: course.id }
  });

  // 3. Estudiantes
  const students = [];
  for (let i = 1; i <= 5; i++) {
    const studentRut = `8888888${i}-8`;
    const s = await prisma.user.upsert({
      where: { rut: studentRut },
      update: { courseId: course.id, passwordHash: profHash },
      create: {
        rut: studentRut,
        passwordHash: profHash,
        role: 'STUDENT',
        name: `Estudiante ${i}`,
        mustChangePassword: false,
        courseId: course.id
      }
    });
    students.push(s);
  }

  // 4. Definición de 3 Ensayos en diferentes momentos del año
  const examsConfig = [
    {
      title: 'SIMCE Lectura 4B - Diagnóstico (Marzo)',
      month: 2, // Marzo (0-indexed)
      difficultyBias: 0.3, // Menor tasa de acierto (base ~40%)
      successProb: 0.40,
    },
    {
      title: 'SIMCE Lectura 4B - Ensayo 1 (Junio)',
      month: 5, // Junio
      difficultyBias: 0.0,
      successProb: 0.65, // Mejora tras remedial (~65%)
    },
    {
      title: 'SIMCE Lectura 4B - Ensayo 2 (Octubre)',
      month: 9, // Octubre
      difficultyBias: -0.2,
      successProb: 0.85, // Consolidación (~85%)
    },
  ];

  for (let eIdx = 0; eIdx < examsConfig.length; eIdx++) {
    const cfg = examsConfig[eIdx];
    const examDate = new Date(2026, cfg.month, 15, 10, 0, 0);

    const exam = await prisma.exam.create({
      data: {
        title: cfg.title,
        subject: 'Lectura',
        level: '4B',
        pdfPath: 'simulacion.pdf',
        optionsCount: 4,
        durationMinutes: 90,
        examType: 'ENSAYO',
        simceCutElemental: 241,
        simceCutAdecuado: 284,
      }
    });

    // Crear 10 preguntas por ensayo con OAs y dificultades calibradas
    const questionsData = [
      { num: 1, ans: 'A', axis: 'Comprensión Literaria', oa: 'OA 4', skill: 'Localizar', diff: -1.0 },
      { num: 2, ans: 'B', axis: 'Comprensión Literaria', oa: 'OA 4', skill: 'Localizar', diff: -0.5 },
      { num: 3, ans: 'C', axis: 'Comprensión Literaria', oa: 'OA 4', skill: 'Interpretar y relacionar', diff: 0.0 },
      { num: 4, ans: 'D', axis: 'Comprensión No Literaria', oa: 'OA 6', skill: 'Inferir sentido global', diff: 0.5 },
      { num: 5, ans: 'A', axis: 'Comprensión No Literaria', oa: 'OA 6', skill: 'Inferir sentido global', diff: 1.0 },
      { num: 6, ans: 'B', axis: 'Comprensión No Literaria', oa: 'OA 6', skill: 'Reflexionar', diff: 1.2 },
      { num: 7, ans: 'C', axis: 'Comprensión Literaria', oa: 'OA 3', skill: 'Reflexionar', diff: 0.2 },
      { num: 8, ans: 'D', axis: 'Comprensión Literaria', oa: 'OA 3', skill: 'Interpretar expresiones', diff: -0.2 },
      { num: 9, ans: 'A', axis: 'Extracción de Información', oa: 'OA 4', skill: 'Localizar', diff: -0.8 },
      { num: 10, ans: 'B', axis: 'Extracción de Información', oa: 'OA 6', skill: 'Inferir', diff: 0.6 },
    ];

    const createdQuestions = [];
    for (const q of questionsData) {
      const dbQ = await prisma.question.create({
        data: {
          examId: exam.id,
          questionNumber: q.num,
          correctAnswer: q.ans,
          axis: q.axis,
          learningObjective: q.oa,
          skill: q.skill,
          difficulty: q.diff,
          discrimination: 1.2,
          guessing: 0.25,
        }
      });
      createdQuestions.push(dbQ);
    }

    // Asignación
    const assignment = await prisma.examAssignment.create({
      data: {
        examId: exam.id,
        courseId: course.id,
        assignedTeacherRut: teacher.rut,
        opensAt: new Date(examDate.getTime() - 1000 * 60 * 60 * 2),
        closesAt: new Date(examDate.getTime() + 1000 * 60 * 60 * 24),
        released: true,
        releasedAt: examDate,
        releasedBy: 'Dirección Académica'
      }
    });

    // Respuestas de los 5 estudiantes
    for (let sIdx = 0; sIdx < students.length; sIdx++) {
      const student = students[sIdx];
      const submission = await prisma.submission.create({
        data: {
          studentRut: student.rut,
          assignmentId: assignment.id,
          status: 'SUBMITTED',
          startedAt: new Date(examDate.getTime() - 1000 * 60 * 60),
          submittedAt: examDate,
        }
      });

      const answersMap = {};
      // Generar aciertos según la probabilidad de crecimiento de la cohorte
      for (const q of createdQuestions) {
        // Estudiantes más avanzados tienen ligera ventaja (+0.1)
        const studentAbilityMod = (sIdx - 2) * 0.05;
        const pSuccess = Math.max(0.1, Math.min(0.95, cfg.successProb + studentAbilityMod));
        const isCorrect = Math.random() < pSuccess;
        let selected = q.correctAnswer;
        if (!isCorrect) {
          const others = ['A', 'B', 'C', 'D'].filter(opt => opt !== q.correctAnswer);
          selected = others[Math.floor(Math.random() * others.length)];
        }
        answersMap[q.id] = selected;

        await prisma.submissionAnswer.create({
          data: {
            submissionId: submission.id,
            questionId: q.id,
            selectedAnswer: selected,
            isCorrect,
          }
        });
      }

      // Calcular resultados oficiales con el motor psicométrico
      const res = computeResults(createdQuestions, answersMap, exam);

      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          correctCount: res.correctCount,
          percent: res.percent,
          grade: res.grade,
          achievementLevel: res.achievementLevel,
          simceScore: res.simceScore,
          theta: res.theta,
          seTheta: res.seTheta,
        }
      });
    }

    console.log(`✓ Creado: ${cfg.title} (Fecha: ${examDate.toLocaleDateString()}) - Asignación ID: ${assignment.id}`);
  }

  console.log("-------------------------------------------------------------------");
  console.log("¡Serie longitudinal de 3 evaluaciones generada exitosamente!");
  console.log("Alumno para probar: RUT 88888881-8 / Clave: 1234");
  console.log("Profesor para probar: RUT 99999999-9 / Clave: 1234");
  console.log("-------------------------------------------------------------------");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
