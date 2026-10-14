const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Asegurar que el archivo SQLite tenga todas las columnas actuales (incluyendo simceScore, etc.)
try {
  const prismaBin = path.join(__dirname, 'node_modules', 'prisma', 'build', 'index.js');
  if (fs.existsSync(prismaBin)) {
    execSync(`"${process.execPath}" "${prismaBin}" db push --accept-data-loss`, {
      cwd: __dirname,
      stdio: 'ignore'
    });
  }
} catch (e) {}

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- 1. Vaciando tablas de la base de datos ---');
  await prisma.submissionAnswer.deleteMany({});
  await prisma.submission.deleteMany({});
  await prisma.remedialProposal.deleteMany({});
  await prisma.simceMilestone.deleteMany({});
  await prisma.examAssignment.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.exam.deleteMany({});
  await prisma.teacherCourse.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.course.deleteMany({});

  console.log('--- 2. Creando usuario Administrador único ---');
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      rut: '11111111-1',
      name: 'Administrador (UTP / Admin)',
      role: 'ADMIN',
      passwordHash,
      mustChangePassword: false,
      isActive: true,
    }
  });

  console.log('--- Base de datos limpiada con éxito ---');
  console.log(`Usuario creado: [${admin.role}] ${admin.name} | RUT: ${admin.rut} | Clave: admin123`);
}

main()
  .catch((e) => {
    console.error('Error al limpiar base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
