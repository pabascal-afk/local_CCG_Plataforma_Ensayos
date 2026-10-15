# PRUEBAS CCG — Ambiente de Pruebas Regulares (Puerto 3600)

Instancia bifurcada (*fork*) de la Plataforma de Ensayos SIMCE del Colegio Cerro Grande, configurada para pruebas de desarrollo, validación docente y ensayos experimentales sin afectar la instancia de producción en el puerto 3300.

---

## 🚀 Arquitectura del Entorno de Pruebas

- **Puerto Principal (LAN):** `3600` (`http://<IP_SERVIDOR>:3600` o `http://localhost:3600`)
- **Frontend:** Next.js 14 optimizado en producción (escuchando en `0.0.0.0:3600`).
- **Backend / API:** Node.js + Express + Prisma ORM + SQLite (escuchando en `127.0.0.1:3601`).
- **Base de Datos:** SQLite independiente (`backend/prisma/simce.db`). Cualquier cambio o prueba aquí **NO** afecta los datos de producción en el puerto 3300.

---

## 🛠️ Cómo Iniciar PRUEBAS CCG

1. **Modo Consola (para ver logs en tiempo real):**
   Hacer doble clic en `Iniciar_Consola.bat`.

2. **Modo Segundo Plano (con icono en la bandeja del sistema):**
   Hacer doble clic en `Iniciar_Plataforma.vbs` o `Lanzador CCG.bat`.

3. **Acceso Rápido desde Estaciones de Trabajo:**
   Ejecutar `Lanzador_Plataforma.exe` en los equipos de la red local.

---

## 👥 Credenciales Iniciales

- **RUT:** `11111111-1` o `admin`
- **Contraseña:** `admin123`

Para reiniciar la base de datos de pruebas a su estado inicial en cualquier momento, ejecutar `Limpiar_Base_Datos.bat`.
