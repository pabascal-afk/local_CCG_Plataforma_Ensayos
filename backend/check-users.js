const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findUnique({ where: { rut: '11111111-1' } });
  if (admin) {
    const isMatch = await bcrypt.compare('admin123', admin.passwordHash);
    console.log("Admin 11111111-1 password 'admin123' valid?", isMatch);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
