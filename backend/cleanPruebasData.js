const path = require('path');
const fs = require('fs');

const backendDir = __dirname;
const rootDir = path.join(backendDir, '..');
const envPath = path.join(backendDir, '.env');

let port = 3001;
if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const m = content.match(/PORT\s*=\s*(\d+)/);
    if (m) port = parseInt(m[1], 10);
}

// PROTECCION ESTRICTA: Solo permitir en PRUEBAS CCG (puerto 3601 o ruta con 'pruebas')
const isPruebas = port === 3601 || rootDir.toLowerCase().includes('pruebas');
if (!isPruebas) {
    console.error('❌ ABORTADO POR SEGURIDAD: Este script solo puede ejecutarse en la instancia de PRUEBAS CCG.');
    console.error('   No se permite limpiar la base de datos de produccion.');
    process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log('[PRUEBAS CCG] Limpiando ensayos y resultados previos para asegurar independencia...');
    
    await prisma.submissionAnswer.deleteMany({});
    await prisma.submission.deleteMany({});
    await prisma.remedialProposal.deleteMany({});
    await prisma.examAssignment.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.exam.deleteMany({});
    
    // Limpiar PDFs en uploads de pruebas
    const uploadsDir = path.join(backendDir, 'uploads');
    if (fs.existsSync(uploadsDir)) {
        for (const file of fs.readdirSync(uploadsDir)) {
            if (file !== '.gitkeep') {
                try { fs.unlinkSync(path.join(uploadsDir, file)); } catch (e) {}
            }
        }
    }
    
    const [userCount, courseCount, examCount] = await Promise.all([
        prisma.user.count(),
        prisma.course.count(),
        prisma.exam.count()
    ]);
    
    console.log('✅ Base de datos de PRUEBAS CCG independizada y limpia:');
    console.log(`   - Ensayos: ${examCount}`);
    console.log(`   - Cursos preservados: ${courseCount}`);
    console.log(`   - Usuarios preservados: ${userCount}`);
}

run()
    .catch((e) => {
        console.error('Error:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
