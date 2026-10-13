const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('1234', 10);
  await prisma.user.updateMany({
    where: { rut: 'profesor-remedial' },
    data: { passwordHash: hash }
  });
  await prisma.user.updateMany({
    where: { rut: { startsWith: 'alumno-test-' } },
    data: { passwordHash: hash }
  });
  console.log('Contraseñas actualizadas a bcrypt!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
