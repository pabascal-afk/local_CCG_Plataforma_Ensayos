const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando generación de datos de prueba para Reporte Remedial...");

  // 1. Crear Curso 4B
  const course = await prisma.course.upsert({
    where: { level_letter_year: { level: '4B', letter: 'A', year: 2026 } },
    update: {},
    create: { level: '4B', letter: 'A', year: 2026 }
  });

  // 2. Asegurar Profesor
  const profHash = await bcrypt.hash('1234', 10);
  const teacherRut = '99999999-9';
  const teacher = await prisma.user.upsert({
    where: { rut: teacherRut },
    update: { role: 'TEACHER', passwordHash: profHash },
    create: { rut: teacherRut, passwordHash: profHash, role: 'TEACHER', name: 'Profesor Remedial', mustChangePassword: false }
  });

  await prisma.teacherCourse.upsert({
    where: { teacherRut_courseId: { teacherRut: teacher.rut, courseId: course.id } },
    update: {},
    create: { teacherRut: teacher.rut, courseId: course.id }
  });

  // 3. Crear 5 Estudiantes en 4B
  const students = [];
  for(let i=1; i<=5; i++) {
    const studentRut = `8888888${i}-8`;
    const s = await prisma.user.upsert({
      where: { rut: studentRut },
      update: { courseId: course.id, passwordHash: profHash },
      create: {
        rut: studentRut,
        passwordHash: profHash,
        role: 'STUDENT',
        name: `Alumno Test ${i}`,
        mustChangePassword: false,
        courseId: course.id
      }
    });
    students.push(s);
  }

  // 4. Crear Ensayo Simulado
  const exam = await prisma.exam.create({
    data: {
      title: 'SIMCE Lectura 4B - Simulación Remedial',
      subject: 'Lectura',
      level: '4B',
      pdfPath: 'simulacion.pdf',
      optionsCount: 4,
      durationMinutes: 90,
      examType: 'ENSAYO'
    }
  });

  // 5. Crear Preguntas con OAs y Habilidades
  const questionsData = [
    { num: 1, ans: 'A', axis: 'Comprensión Literaria', oa: 'OA 4', skill: 'Localizar información explícita' },
    { num: 2, ans: 'B', axis: 'Comprensión Literaria', oa: 'OA 4', skill: 'Localizar información explícita' },
    { num: 3, ans: 'C', axis: 'Comprensión Literaria', oa: 'OA 4', skill: 'Interpretar y relacionar' },
    { num: 4, ans: 'D', axis: 'Comprensión No Literaria', oa: 'OA 6', skill: 'Inferir sentido global' },
    { num: 5, ans: 'A', axis: 'Comprensión No Literaria', oa: 'OA 6', skill: 'Inferir sentido global' },
    { num: 6, ans: 'B', axis: 'Comprensión No Literaria', oa: 'OA 6', skill: 'Reflexionar sobre el contenido' },
    { num: 7, ans: 'C', axis: 'Comprensión Literaria', oa: 'OA 3', skill: 'Reflexionar sobre el texto' },
    { num: 8, ans: 'D', axis: 'Comprensión Literaria', oa: 'OA 3', skill: 'Interpretar expresiones' },
    { num: 9, ans: 'A', axis: 'Extracción de Información', oa: 'OA 4', skill: 'Localizar' },
    { num: 10, ans: 'B', axis: 'Extracción de Información', oa: 'OA 6', skill: 'Inferir' },
  ];

  for (const q of questionsData) {
    await prisma.question.create({
      data: {
        examId: exam.id,
        questionNumber: q.num,
        correctAnswer: q.ans,
        axis: q.axis,
        learningObjective: q.oa,
        skill: q.skill
      }
    });
  }

  // 6. Asignar Ensayo
  const now = new Date();
  const opensAt = new Date(now.getTime() - 1000 * 60 * 60 * 24); // Ayer
  const closesAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7); // En 7 dias

  const assignment = await prisma.examAssignment.create({
    data: {
      examId: exam.id,
      courseId: course.id,
      assignedTeacherRut: teacher.rut,
      opensAt,
      closesAt,
      released: true,
      releasedAt: now,
      releasedBy: 'Sistema'
    }
  });

  // 7. Simular Entregas (Submissions)
  const dbQuestions = await prisma.question.findMany({ where: { examId: exam.id }});

  for (const student of students) {
    const submission = await prisma.submission.create({
      data: {
        studentRut: student.rut,
        assignmentId: assignment.id,
        status: 'SUBMITTED',
        startedAt: new Date(now.getTime() - 1000 * 60 * 45), // hace 45 min
        submittedAt: now,
      }
    });

    let correctCount = 0;

    for (const q of dbQuestions) {
      let isCorrect = false;
      let selectedAnswer = 'C';

      if (q.learningObjective === 'OA 4') {
        isCorrect = Math.random() < 0.8;
      } else if (q.learningObjective === 'OA 6') {
        isCorrect = Math.random() < 0.1;
      } else {
        isCorrect = Math.random() < 0.5;
      }

      if (isCorrect) {
        selectedAnswer = q.correctAnswer;
        correctCount++;
      } else {
        const options = ['A', 'B', 'C', 'D'].filter(opt => opt !== q.correctAnswer);
        selectedAnswer = options[Math.floor(Math.random() * options.length)];
      }

      await prisma.submissionAnswer.create({
        data: {
          submissionId: submission.id,
          questionId: q.id,
          selectedAnswer,
          isCorrect
        }
      });
    }

    const percent = correctCount / 10;
    const grade = percent >= 0.6 ? 4 + ((percent - 0.6) * (3 / 0.4)) : 1 + (percent * (3 / 0.6));
    let achievementLevel = "INSUFICIENTE";
    if (percent >= 0.5) achievementLevel = "ELEMENTAL";
    if (percent >= 0.75) achievementLevel = "ADECUADO";

    await prisma.submission.update({
      where: { id: submission.id },
      data: { correctCount, percent: percent * 100, grade, achievementLevel }
    });
  }

  console.log("-----------------------------------------");
  console.log("¡Datos generados exitosamente!");
  console.log("Puedes ingresar como profesor:");
  console.log("Usuario (RUT): 99999999-9");
  console.log("Contraseña: 1234");
  console.log("-----------------------------------------");
  console.log(`La asignación es el ID: ${assignment.id}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
