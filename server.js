const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { initTray } = require('./tray');

// 1. Configuración de logging dual (consola y archivo server.log)
const logFile = path.join(__dirname, 'server.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const line = `[${ts}] ${msg}`;
    try { console.log(line); } catch (e) {}
    try { logStream.write(line + '\n'); } catch (e) {}
}

// 2. Detección inteligente de la IP local de la red LAN
function getLocalIp() {
    if (process.env.SERVER_IP) return process.env.SERVER_IP;
    try {
        const ipFile = path.join(__dirname, 'server_ip.txt');
        if (fs.existsSync(ipFile)) {
            const fileIp = fs.readFileSync(ipFile, 'utf8').trim();
            if (fileIp && !fileIp.startsWith('#')) return fileIp;
        }
    } catch (e) {}

    const interfaces = os.networkInterfaces();
    const candidateIps = [];

    for (const name of Object.keys(interfaces)) {
        const lowerName = name.toLowerCase();
        // Omitir interfaces virtuales típicas
        const isVirtual = lowerName.includes('virtual') || lowerName.includes('vethernet') || lowerName.includes('vmware') || lowerName.includes('wsl');
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                // Si está en la subred 192.168.3.x (red del colegio), máxima prioridad
                if (iface.address.startsWith('192.168.3.')) {
                    return iface.address;
                }
                if (!isVirtual) {
                    candidateIps.unshift(iface.address);
                } else {
                    candidateIps.push(iface.address);
                }
            }
        }
    }
    return candidateIps[0] || '127.0.0.1';
}

const PORT = parseInt(process.env.PORT, 10) || 3300;
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT, 10) || 3001;
const localIp = getLocalIp();
const nodeExe = process.execPath;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// 3. Liberar puertos si quedaron tomados por instancias anteriores o procesos zombis
function freePortIfBusy(port) {
    try {
        const cmd = `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`;
        execSync(cmd, { stdio: 'ignore', timeout: 4000 });
    } catch (e) {}
}

freePortIfBusy(PORT);
freePortIfBusy(BACKEND_PORT);

// Intentar agregar regla de firewall de Windows (si tiene permisos)
try {
    exec('netsh advfirewall firewall add rule name="Plataforma Ensayos SIMCE (Puerto 3300)" dir=in action=allow protocol=TCP localport=3300', () => {});
} catch (e) {}

log('===============================================================');
log('   Iniciando Plataforma de Ensayos SIMCE (Colegio Cerro Grande)');
log('===============================================================');
log(`- Acceso en este equipo:  http://localhost:${PORT}`);
log(`- Acceso Red Local (LAN): http://${localIp}:${PORT}`);
if (localIp !== '192.168.3.16') {
    log(`  (Si este servidor tiene IP 192.168.3.16: http://192.168.3.16:${PORT})`);
}
log(`- API Interna (Backend):  http://127.0.0.1:${BACKEND_PORT}`);
log('===============================================================');

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

// 4. Auto-verificación de Backend (entorno, dependencias, BD con usuario admin)
const backendEnv = path.join(backendDir, '.env');
const backendEnvExample = path.join(backendDir, '.env.example');
if (!fs.existsSync(backendEnv) && fs.existsSync(backendEnvExample)) {
    try {
        fs.copyFileSync(backendEnvExample, backendEnv);
        log('[Backend] Archivo .env creado automáticamente desde .env.example');
    } catch (e) {}
}

const backendNodeModules = path.join(backendDir, 'node_modules');
if (!fs.existsSync(backendNodeModules)) {
    log('[Backend] Instalando dependencias de Node.js en backend...');
    try {
        execSync(`"${npmCmd}" install --no-audit`, { cwd: backendDir, stdio: 'inherit' });
    } catch (e) {
        log(`[Backend Error] Falló npm install: ${e.message}`);
    }
}

// Verificar base de datos SQLite y usuario admin
const prismaDbPath = path.join(backendDir, 'prisma', 'simce.db');
const directDbPath = path.join(backendDir, 'simce.db');
if (!fs.existsSync(prismaDbPath) && !fs.existsSync(directDbPath)) {
    log('[Backend] Base de datos no encontrada. Inicializando y creando usuario admin...');
    try {
        execSync(`"${npxCmd}" prisma generate`, { cwd: backendDir, stdio: 'inherit' });
        execSync(`"${npxCmd}" prisma migrate deploy`, { cwd: backendDir, stdio: 'inherit' });
        execSync(`"${nodeExe}" clean-db.js`, { cwd: backendDir, stdio: 'inherit' });
        log('[Backend] Base de datos creada con éxito (Admin: 11111111-1 / admin123)');
    } catch (e) {
        log(`[Backend Error] Error inicializando base de datos: ${e.message}`);
    }
}

// 5. Auto-verificación de Frontend (dependencias y build de producción en .next)
const frontendNodeModules = path.join(frontendDir, 'node_modules');
if (!fs.existsSync(frontendNodeModules)) {
    log('[Frontend] Instalando dependencias de Node.js en frontend...');
    try {
        execSync(`"${npmCmd}" install --no-audit`, { cwd: frontendDir, stdio: 'inherit' });
    } catch (e) {
        log(`[Frontend Error] Falló npm install en frontend: ${e.message}`);
    }
}

const frontendBuildId = path.join(frontendDir, '.next', 'BUILD_ID');
if (!fs.existsSync(frontendBuildId)) {
    log('========================================================================');
    log(' [AVISO] Compilando frontend Next.js para producción por primera vez...');
    log(' Esto puede tardar 1 o 2 minutos. Por favor espere...');
    log('========================================================================');
    try {
        execSync(`"${npmCmd}" run build`, { 
            cwd: frontendDir, 
            stdio: 'inherit',
            env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
        });
        log('[Frontend] Compilación finalizada exitosamente.');
    } catch (e) {
        log(`[Frontend Error] Error crítico compilando Next.js: ${e.message}`);
    }
}

let isShuttingDown = false;

// 6. Iniciar Backend (Express en puerto 3001)
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

// 7. Iniciar Frontend (Next.js en producción en el puerto 3300, escuchando en 0.0.0.0)
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
        if (code !== 0) {
            log('[ERROR CRITICO] El Frontend en el puerto ' + PORT + ' se detuvo.');
            log('[AYUDA] Verifica si faltó compilar ejecutando "npm run build" dentro de frontend/.');
        }
    }
});

// 8. Cierre ordenado de los procesos
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

// 9. Inicializar Bandeja del Sistema (Tray Icon)
try {
    initTray(PORT, localIp, shutdown);
    log('[Tray] Icono de bandeja del sistema activo.');
} catch (err) {
    log(`[Tray Advertencia]: ${err.message}`);
}
