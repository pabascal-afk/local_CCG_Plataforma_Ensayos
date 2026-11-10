const { PrismaClient } = require('@prisma/client');

// Instancia única compartida por toda la API.
const prisma = new PrismaClient();

let initialized = false;

/**
 * Ajustes de SQLite para concurrencia (60-90 alumnos simultáneos):
 * - WAL: lectores no bloquean a escritores.
 * - busy_timeout: espera hasta 5 s en vez de fallar con "database is locked".
 * - synchronous=NORMAL: seguro con WAL y mucho más rápido.
 */
async function initDatabase() {
  if (initialized) return;
  await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
  await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
  await prisma.$queryRawUnsafe('PRAGMA foreign_keys=ON;');
  try {
    const examColumns = await prisma.$queryRawUnsafe(`PRAGMA table_info('Exam');`);
    const hasGradingMode = Array.isArray(examColumns) && examColumns.some((col) => col.name === 'gradingMode');
    if (!hasGradingMode) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Exam" ADD COLUMN "gradingMode" TEXT NOT NULL DEFAULT 'SIMCE';`);
    }
  } catch (err) {
    if (!String(err?.message || '').toLowerCase().includes('duplicate column')) {
      throw err;
    }
  }
  initialized = true;
}

module.exports = { prisma, initDatabase };
