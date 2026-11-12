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

  // Auto-healing de tabla logs_auditoria para bases SQLite existentes sin migración manual
  await ensureAuditTableSchema();

  initialized = true;
}

let auditTableEnsured = false;

async function ensureAuditTableSchema() {
  if (auditTableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "logs_auditoria" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "fecha_hora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "origen_actor" TEXT NOT NULL DEFAULT 'USUARIO',
      "usuario_id" TEXT,
      "usuario_email" TEXT NOT NULL,
      "usuario_nombre" TEXT,
      "usuario_rol" TEXT,
      "desencadenado_por_id" TEXT,
      "desencadenado_por_nombre" TEXT,
      "desencadenado_por_rol" TEXT,
      "modulo" TEXT NOT NULL,
      "accion" TEXT NOT NULL,
      "nivel" TEXT NOT NULL DEFAULT 'info',
      "entidad" TEXT,
      "entidad_id" TEXT,
      "descripcion" TEXT NOT NULL,
      "detalles" TEXT,
      "ip" TEXT,
      "user_agent" TEXT
    );
  `);

  const cols = await prisma.$queryRawUnsafe(`PRAGMA table_info('logs_auditoria');`);
  const existingCols = new Set(Array.isArray(cols) ? cols.map((c) => c.name) : []);
  const extraCols = [
    { name: 'origen_actor', sql: `ALTER TABLE "logs_auditoria" ADD COLUMN "origen_actor" TEXT NOT NULL DEFAULT 'USUARIO';` },
    { name: 'desencadenado_por_id', sql: `ALTER TABLE "logs_auditoria" ADD COLUMN "desencadenado_por_id" TEXT;` },
    { name: 'desencadenado_por_nombre', sql: `ALTER TABLE "logs_auditoria" ADD COLUMN "desencadenado_por_nombre" TEXT;` },
    { name: 'desencadenado_por_rol', sql: `ALTER TABLE "logs_auditoria" ADD COLUMN "desencadenado_por_rol" TEXT;` },
  ];
  for (const col of extraCols) {
    if (!existingCols.has(col.name)) {
      try {
        await prisma.$executeRawUnsafe(col.sql);
      } catch (err) {
        if (!String(err?.message || '').toLowerCase().includes('duplicate column')) throw err;
      }
    }
  }

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_audit_fecha" ON "logs_auditoria"("fecha_hora");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_audit_modulo" ON "logs_auditoria"("modulo");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_audit_usuario" ON "logs_auditoria"("usuario_email");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_audit_accion" ON "logs_auditoria"("accion");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_audit_nivel" ON "logs_auditoria"("nivel");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_audit_origen" ON "logs_auditoria"("origen_actor");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_audit_desencadenado" ON "logs_auditoria"("desencadenado_por_id");`);

  auditTableEnsured = true;
}

module.exports = { prisma, initDatabase, ensureAuditTableSchema };
