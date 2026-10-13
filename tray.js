const SysTray = require('systray2').default;
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function getIconBase64() {
    try {
        const iconPath = path.join(__dirname, 'icon.txt');
        if (fs.existsSync(iconPath)) {
            return fs.readFileSync(iconPath, 'utf8').trim();
        }
        const icoPath = path.join(__dirname, 'app.ico');
        if (fs.existsSync(icoPath)) {
            return fs.readFileSync(icoPath).toString('base64');
        }
    } catch (e) {
        // Fallback below
    }
    return "AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAADIMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/yDIy/8gyMv/IMjL/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
}

function initTray(port, localIp, onExit) {
    const icon = getIconBase64();

    const systray = new SysTray({
        menu: {
            icon: icon,
            title: "Plataforma Ensayos SIMCE",
            tooltip: `Servidor SIMCE activo en http://${localIp}:${port}`,
            items: [
                {
                    title: "🌐 Abrir en este PC",
                    tooltip: `Abre http://localhost:${port}`,
                    checked: false,
                    enabled: true
                },
                {
                    title: `📱 Abrir desde la red (IP: ${localIp})`,
                    tooltip: `Abre http://${localIp}:${port}`,
                    checked: false,
                    enabled: true
                },
                {
                    title: "<SEPARATOR>",
                    tooltip: "",
                    checked: false,
                    enabled: true
                },
                {
                    title: "❌ Detener Servidor",
                    tooltip: "Apaga el servidor y cierra la aplicación",
                    checked: false,
                    enabled: true
                }
            ]
        },
        debug: false,
        copyDir: true
    });

    systray.onClick(action => {
        if (action.item.title === '❌ Detener Servidor') {
            try { systray.kill(); } catch (e) {}
            if (onExit) onExit();
            else process.exit(0);
        } else if (action.item.title === '🌐 Abrir en este PC') {
            exec(`start http://localhost:${port}`);
        } else if (action.item.title.startsWith('📱 Abrir desde la red')) {
            exec(`start http://${localIp}:${port}`);
        }
    });

    systray.ready().then(() => {
        console.log('[Tray] Icono de bandeja del sistema activo.');
    }).catch(err => {
        console.error('[Tray] Advertencia:', err.message || err);
    });

    return systray;
}

module.exports = { initTray };
