# Plataforma Local de Ensayos SIMCE — Colegio Cerro Grande

Sistema institucional integral para la administración, aplicación en línea, corrección automática, análisis psicométrico (TRI/IRT), monitoreo en tiempo real, gestión de evaluaciones remediales y trayectorias multianuales de Ensayos SIMCE.

Diseñado para funcionar en **Servidor Local dentro de la Red del Colegio (LAN)** en el **Puerto 8000**, sin depender de túneles externos ni servicios en la nube de pago.

---

## 🚀 Arquitectura en Red Local (LAN)

- **Puerto Principal de la Red (LAN):** `8000` (`http://<IP_SERVIDOR>:8000` o `http://localhost:8000`)
- **Frontend:** Next.js 14 optimizado en producción (escuchando en `0.0.0.0:8000`).
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
   - Configura la regla en el Firewall de Windows para permitir tráfico entrante por el puerto 8000.
   - Crea un acceso directo en el Escritorio con el logo institucional.
   - Inicia automáticamente la plataforma en segundo plano.

2. **`Iniciar_Plataforma.vbs`:**
   - Lanzador silencioso en segundo plano (sin ventana negra de consola).
   - Ejecuta `server.js` y levanta el icono en la bandeja del sistema (*System Tray*).

3. **`server.js` & `tray.js` (Bandeja del Sistema / Tray Icon):**
   - Mantiene los procesos de frontend y backend orquestados.
   - Coloca un icono en el área de notificaciones (junto al reloj de Windows).
   - Menú contextual:
     - 🌐 **Abrir en este PC:** Abre `http://localhost:8000` en el navegador.
     - 📱 **Abrir desde la red (IP):** Abre `http://<IP_LOCAL>:8000`.
     - ❌ **Detener Servidor:** Apaga limpiamente el frontend, backend y el icono.

4. **`Lanzador_Plataforma.exe`:**
   - Aplicación cliente ligera para los computadores de la sala de profesores, laboratorios o salas de clases.
   - Comprueba la conectividad al servidor local en el puerto 8000 y abre automáticamente el navegador web predeterminado.

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

## 👥 Roles y Credenciales Predeterminadas (Demo / Inicial)

| Rol | RUT | Contraseña Inicial | Funcionalidad |
| :--- | :--- | :--- | :--- |
| **Director / Admin** | `11.111.111-1` | `admin123` | Dashboard global, trayectoria multianual, gestión de ensayos, cursos, usuarios y UTP |
| **Docente** | `22.222.222-2` | `profesor123` | Monitoreo en vivo, pauta, análisis de habilidades, acción remedial y PIN de clase |
| **Estudiante** | `33.333.333-3` | `alumno123` | Rendición en línea, calculadora, visor de PDF de prueba, informe de logro y retroalimentación |

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
├── server.js                 # Orquestador del servidor (Puerto 8000 + Backend 3001)
├── tray.js                   # Integración con la bandeja de Windows (systray2)
├── package.json              # Dependencias del orquestador
└── README.md                 # Documentación técnica y operacional
```
