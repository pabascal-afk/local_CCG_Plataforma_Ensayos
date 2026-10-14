const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { initTray } = require('./tray');

// 1. Configuración de logging a archivo server.log
const logFile = path.join(__dirname, 'server.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const line = `[${ts}] ${msg}`;
    try { console.log(line); } catch (e) {}
    try { logStream.write(line + '\n'); } catch (e) {}
}

// 2. Obtener IP local de la tarjeta de red (IPv4)
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

const PORT = parseInt(process.env.PORT, 10) || 3300;
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT, 10) || 3001;
const localIp = getLocalIp();

// 3. Liberar puertos si quedaron tomados por procesos anteriores (zombis / cierres forzados)
function freePortIfBusy(port) {
    try {
        const cmd = `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`;
        execSync(cmd, { stdio: 'ignore', timeout: 4000 });
    } catch (e) {
        // Ignorar si no había proceso
    }
}

freePortIfBusy(PORT);
freePortIfBusy(BACKEND_PORT);

log('===============================================================');
log('   Iniciando Plataforma de Ensayos SIMCE (Colegio Cerro Grande)');
log('===============================================================');
log(`- Acceso Red Local (LAN): http://${localIp}:${PORT}`);
log(`- Acceso en este equipo:  http://localhost:${PORT}`);
log(`- API Interna (Backend):  http://127.0.0.1:${BACKEND_PORT}`);
log('===============================================================');

const nodeExe = process.execPath;
let isShuttingDown = false;

// 4. Iniciar Backend (Express + SQLite Prisma en puerto 3001)
const backendDir = path.join(__dirname, 'backend');
const backendProc = spawn(nodeExe, ['src/index.js'], {
    cwd: backendDir,
    env: { 
        ...process.env, 
        PORT: String(BACKEND_PORT), 
        HOST: '127.0.0.1' 
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
});

backendProc.stdout.on('data', (d) => {
    log(`[Backend] ${d.toString().trim()}`);
});
backendProc.stderr.on('data', (d) => {
    log(`[Backend Error] ${d.toString().trim()}`);
});
backendProc.on('error', (err) => {
    log(`[Backend Error fatal]: ${err.message}`);
});
backendProc.on('exit', (code) => {
    if (!isShuttingDown) {
        log(`[Backend finalizó]: código ${code}`);
    }
});

// 5. Iniciar Frontend (Next.js en producción en el puerto 3300, escuchando en 0.0.0.0)
const frontendDir = path.join(__dirname, 'frontend');
const nextBin = path.join(frontendDir, 'node_modules', 'next', 'dist', 'bin', 'next');

const frontendProc = spawn(nodeExe, [nextBin, 'start', '-p', String(PORT), '-H', '0.0.0.0'], {
    cwd: frontendDir,
    env: { 
        ...process.env, 
        PORT: String(PORT), 
        API_INTERNAL_URL: `http://127.0.0.1:${BACKEND_PORT}` 
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
});

frontendProc.stdout.on('data', (d) => {
    log(`[Frontend] ${d.toString().trim()}`);
});
frontendProc.stderr.on('data', (d) => {
    log(`[Frontend Error] ${d.toString().trim()}`);
});
frontendProc.on('error', (err) => {
    log(`[Frontend Error fatal]: ${err.message}`);
});
frontendProc.on('exit', (code) => {
    if (!isShuttingDown) {
        log(`[Frontend finalizó]: código ${code}`);
    }
});

// 6. Cierre ordenado de los procesos
function killTree(proc) {
    if (!proc || !proc.pid) return;
    try {
        execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
    } catch (e) {
        try { proc.kill(); } catch (err) {}
    }
}

function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log('[INFO] Apagando servidores...');
    killTree(backendProc);
    killTree(frontendProc);
    try { logStream.end(); } catch (e) {}
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
    killTree(backendProc);
    killTree(frontendProc);
});

// 7. Inicializar Bandeja del Sistema (Tray Icon)
try {
    initTray(PORT, localIp, shutdown);
    log('[Tray] Icono de bandeja del sistema activo.');
} catch (err) {
    log(`[Tray Advertencia]: ${err.message}`);
}
