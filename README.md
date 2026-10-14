# Plataforma Local de Ensayos SIMCE — Colegio Cerro Grande

Sistema institucional integral para la administración, aplicación en línea, corrección automática, análisis psicométrico (TRI/IRT), monitoreo en tiempo real, gestión de evaluaciones remediales y trayectorias multianuales de Ensayos SIMCE.

Diseñado para funcionar en **Servidor Local dentro de la Red del Colegio (LAN)** en el **Puerto 3300**, sin depender de túneles externos ni servicios en la nube de pago.

---

## 🚀 Arquitectura en Red Local (LAN)

- **Puerto Principal de la Red (LAN):** `3300` (`http://<IP_SERVIDOR>:3300` o `http://localhost:3300`)
- **Frontend:** Next.js 14 optimizado en producción (escuchando en `0.0.0.0:3300`).
- **Backend / API:** Node.js + Express + Prisma ORM + SQLite (escuchando en `127.0.0.1:3001` detrás del proxy interno).
- **Base de Datos:** SQLite local rápida, autónoma y persistente (`backend/simce.db`).

---

## 📦 Componentes de Despliegue en el Servidor

1. **`Instalador_Servidor.bat`:**
   - Script automatizado en un solo clic.
   - Verifica Git y Node.js.
   - Clona o actualiza el repositorio desde GitHub (`git pull origin main`).
   - Instala todas las dependencias (`npm install`).
   - Genera el cliente Prisma y aplica migraciones a la base de datos SQLite.
   - Compila la versión de producción de Next.js (`npm run build`).
   - Configura la regla en el Firewall de Windows para permitir tráfico entrante por el puerto 3300.
   - Crea un acceso directo en el Escritorio con el logo institucional.
   - Inicia automáticamente la plataforma en segundo plano.

2. **`Iniciar_Plataforma.vbs`:**
   - Lanzador silencioso en segundo plano (sin ventana negra de consola).
   - Ejecuta `server.js` y levanta el icono en la bandeja del sistema (*System Tray*).

3. **`server.js` & `tray.js` (Bandeja del Sistema / Tray Icon):**
   - Mantiene los procesos de frontend y backend orquestados.
   - Coloca un icono en el área de notificaciones (junto al reloj de Windows).
   - Menú contextual:
     - 🌐 **Abrir en este PC:** Abre `http://localhost:3300` en el navegador.
     - 📱 **Abrir desde la red (IP):** Abre `http://<IP_LOCAL>:3300`.
     - ❌ **Detener Servidor:** Apaga limpiamente el frontend, backend y el icono.

4. **`Lanzador_Plataforma.exe`:**
   - Aplicación cliente ligera para los computadores de la sala de profesores, laboratorios o salas de clases.
   - Comprueba la conectividad al servidor local en el puerto 3300 y abre automáticamente el navegador web predeterminado.

---

## 🛠️ Instalación y Actualización Rápida

### En el Servidor del Colegio:
1. Descarga o clona el repositorio:
   ```cmd
   git clone https://github.com/pabascal-afk/local_CCG_Plataforma_Ensayos.git
   ```
2. Ejecuta haciendo doble clic en:
   ```cmd
   Instalador_Servidor.bat
   ```
3. ¡Listo! La plataforma quedará corriendo y con acceso directo en el escritorio.

---

## 👥 Credenciales de Administrador (Servidor Limpio)

| Rol | RUT / Usuario | Contraseña | Funcionalidad |
| :--- | :--- | :--- | :--- |
| **Administrador (UTP / Admin)** | `11111111-1` o `admin` | `admin123` | Dashboard global, trayectoria multianual, gestión de ensayos, cursos, usuarios y UTP |

> [!NOTE]
> Para restaurar la base de datos limpia en cualquier momento dejando unicamente este usuario administrador, basta con ejecutar `Limpiar_Base_Datos.bat`.

---

## 🛠️ Herramientas y Scripts del Servidor

- **`Instalador_Servidor.bat`:** Instalador/actualizador automático con auto-elevación a Administrador (Git pull, dependencias, build de Next.js, regla de Firewall y accesos directos).
- **`Iniciar_Consola.bat`:** Inicia el servidor en una consola visible para ver en tiempo real los registros y verificar que esté listo en `http://192.168.3.16:3300`.
- **`Iniciar_Plataforma.vbs`:** Inicia el servidor en segundo plano con icono en la bandeja del sistema (*Tray Icon*).
- **`Configurar_Firewall_Admin.bat`:** Script con auto-elevación para desbloquear el puerto 3300 en el Firewall de Windows en caso de que otros equipos no puedan conectarse.
- **`Limpiar_Base_Datos.bat`:** Vacía todas las tablas y deja listo el sistema con el usuario administrador inicial.
- **`Lanzador_Plataforma.exe`:** Aplicación de escritorio ligera para los computadores cliente/alumnos/profesores (busca automáticamente `192.168.3.16:3300` o la IP configurada en `server_ip.txt`).

---

## 📂 Estructura del Proyecto

```text
├── backend/                  # API REST Express + Prisma + SQLite
│   ├── prisma/               # Esquema de datos, migraciones y seed
│   ├── src/                  # Controladores, rutas, servicios y middlewares
│   └── uploads/              # PDFs de pautas y cuadernillos de ensayos
├── frontend/                 # Aplicación Web Next.js 14 + Tailwind CSS
│   ├── src/app/              # Rutas (admin, teacher, student, login)
│   ├── src/components/       # Modales, widgets, gráficos y AppShell
│   └── next.config.mjs       # Rewrites internos hacia el backend
├── Lanzador_Plataforma.exe   # Ejecutable cliente para estaciones de trabajo
├── Launcher.cs               # Código fuente del cliente lanzador (C# .NET)
├── Iniciar_Plataforma.vbs    # Ejecutor silencioso en segundo plano
├── Instalador_Servidor.bat   # Script de instalación y actualización automática
├── server.js                 # Orquestador del servidor (Puerto 3300 + Backend 3001)
├── tray.js                   # Integración con la bandeja de Windows (systray2)
├── package.json              # Dependencias del orquestador
└── README.md                 # Documentación técnica y operacional
```
