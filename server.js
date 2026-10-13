const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');
const { initTray } = require('./tray');

// Obtener IP local de la tarjeta de red (IPv4)
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const PORT = process.env.PORT || 8000;
const BACKEND_PORT = process.env.BACKEND_PORT || 3001;
const localIp = getLocalIp();

console.log('===============================================================');
console.log('   Iniciando Plataforma de Ensayos SIMCE (Colegio Cerro Grande)');
console.log('===============================================================');
console.log(`- Acceso Red Local (LAN): http://${localIp}:${PORT}`);
console.log(`- Acceso en este equipo:  http://localhost:${PORT}`);
console.log(`- API Interna (Backend):  http://127.0.0.1:${BACKEND_PORT}`);
console.log('===============================================================');

// Iniciar Backend (Express + SQLite Prisma)
const backendDir = path.join(__dirname, 'backend');
const backendProc = spawn('node', ['src/index.js'], {
    cwd: backendDir,
    env: { 
        ...process.env, 
        PORT: String(BACKEND_PORT), 
        HOST: '127.0.0.1' 
    },
    stdio: 'inherit',
    windowsHide: true,
});

backendProc.on('error', (err) => {
    console.error('[Error Backend]:', err);
});

// Iniciar Frontend (Next.js en producción en el puerto 8000, escuchando en 0.0.0.0)
const frontendDir = path.join(__dirname, 'frontend');
const nextBin = path.join(frontendDir, 'node_modules', 'next', 'dist', 'bin', 'next');

const frontendProc = spawn('node', [nextBin, 'start', '-p', String(PORT), '-H', '0.0.0.0'], {
    cwd: frontendDir,
    env: { 
        ...process.env, 
        PORT: String(PORT), 
        API_INTERNAL_URL: `http://127.0.0.1:${BACKEND_PORT}` 
    },
    stdio: 'inherit',
    windowsHide: true,
});

frontendProc.on('error', (err) => {
    console.error('[Error Frontend]:', err);
});

let isShuttingDown = false;
function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n[INFO] Apagando servidores...');
    try { backendProc.kill(); } catch (e) {}
    try { frontendProc.kill(); } catch (e) {}
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
    try { backendProc.kill(); } catch (e) {}
    try { frontendProc.kill(); } catch (e) {}
});

// Inicializar Tray Icon
try {
    initTray(PORT, localIp, shutdown);
} catch (err) {
    console.warn('[Tray] No se pudo inicializar la bandeja:', err.message);
}
