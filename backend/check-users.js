const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'DIRECTOR', 'TEACHER'] } },
    select: { rut: true, name: true, role: true, passwordHash: true }
  });
  const candidates = ['simce123', 'admin123', 'profesor123', '1234', '123456'];
  for (const u of users) {
    let matched = null;
    for (const c of candidates) {
      if (await bcrypt.compare(c, u.passwordHash)) {
        matched = c;
        break;
      }
    }
    console.log(`- [${u.role}] ${u.name} | RUT: ${u.rut} -> Clave: ${matched || 'OTRA DESCONOCIDA'}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
