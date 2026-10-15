# Plataforma Local de Ensayos SIMCE — Colegio Cerro Grande

Sistema institucional integral para la administración, aplicación en línea, corrección automática, análisis psicométrico (TRI/IRT), monitoreo en tiempo real, gestión de evaluaciones remediales y trayectorias multianuales de Ensayos SIMCE.

Diseñado para funcionar en **Servidor Local dentro de la Red del Colegio (LAN)** con soporte dinámico para dos entornos independientes en el mismo servidor:
- 🟢 **Producción Oficial:** Puerto LAN `3300` / Backend API `3001` (Carpeta `ENSAYOS SIMCE`)
- 🟡 **Entorno de Pruebas (PRUEBAS CCG):** Puerto LAN `3600` / Backend API `3601` (Carpeta `PRUEBAS CCG`)

---

## 🚀 Arquitectura en Red Local (LAN)

| Componente | Producción Oficial | Entorno de Pruebas (PRUEBAS CCG) |
| :--- | :--- | :--- |
| **Acceso Navegador / LAN** | `http://<IP_SERVIDOR>:3300` | `http://<IP_SERVIDOR>:3600` |
| **Frontend** | Next.js 14 (`0.0.0.0:3300`) | Next.js 14 (`0.0.0.0:3600`) |
| **Backend API** | Node.js + Express (`127.0.0.1:3001`) | Node.js + Express (`127.0.0.1:3601`) |
| **Base de Datos** | SQLite (`backend/prisma/simce.db`) | SQLite independiente (`backend/prisma/simce.db`) |
| **Identidad Visual** | `ENSAYOS CCG` | `PRUEBAS CCG` (badge `TEST :3600`) |

---

## 📦 Componentes y Lanzadores

1. **`Iniciar_Consola.bat`:**
   - Inicia el servidor mostrando la consola con registros en tiempo real.
   - Detecta automáticamente el puerto y entorno según la carpeta o configuración en `backend/.env`.

2. **`Iniciar_Plataforma.vbs` & `Lanzador CCG.bat`:**
   - Lanzador en segundo plano con icono en la bandeja del sistema (*System Tray*).

3. **`Lanzador_Plataforma.exe`:**
   - Aplicación cliente ligera para los computadores de la red del colegio.
   - Detecta y conecta automáticamente a la plataforma (puertos 3300 o 3600).

4. **`Configurar_Firewall_Admin.bat`:**
   - Desbloquea en el Firewall de Windows tanto los puertos de producción (3300/3001) como de pruebas (3600/3601).

5. **`Instalador_Servidor.bat`:**
   - Instalador/actualizador automático con auto-elevación a Administrador.

---

## 👥 Credenciales de Administrador (Servidor Limpio)

| Rol | RUT / Usuario | Contraseña | Funcionalidad |
| :--- | :--- | :--- | :--- |
| **Administrador (UTP / Admin)** | `11111111-1` o `admin` | `admin123` | Dashboard global, trayectoria multianual, gestión de ensayos, cursos, usuarios y UTP |

Para restaurar la base de datos limpia en cualquier momento, ejecutar `Limpiar_Base_Datos.bat`.
