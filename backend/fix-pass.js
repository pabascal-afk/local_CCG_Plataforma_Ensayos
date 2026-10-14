const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin123', 10);
  await prisma.user.update({
    where: { rut: '11111111-1' },
    data: { passwordHash: hash }
  });
  console.log('Admin 11111111-1 actualizado con password admin123 con exito!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
