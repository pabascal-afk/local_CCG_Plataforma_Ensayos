@echo off
color 0B
title Actualizar Plataforma SIMCE desde GitHub - Colegio Cerro Grande
cd /d "%~dp0"

echo ===============================================================
echo     Actualizador de Plataforma SIMCE - Colegio Cerro Grande
echo ===============================================================
echo.

echo [1/4] Deteniendo instancias previas en el puerto 3300...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3300 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
echo [2/4] Descargando ultimos cambios desde GitHub (origin/main)...
git config --global http.sslVerify false >nul 2>&1
git fetch origin main
git stash
git pull origin main
IF ERRORLEVEL 1 (
    echo.
    echo [AVISO] Fallo git pull regular por modificaciones locales.
    echo [INFO] Forzando sincronizacion exacta con origin/main...
    git reset --hard origin/main
)

echo.
echo [3/4] Sincronizando Base de Datos SQLite con Prisma...
cd backend
node node_modules\prisma\build\index.js db push --accept-data-loss
node node_modules\prisma\build\index.js generate
cd ..

echo.
echo [4/4] Compilando Frontend Next.js para produccion...
cd frontend
node node_modules\next\dist\bin\next build
IF ERRORLEVEL 1 (
    color 0C
    echo [ERROR] Fallo la compilacion de Next.js.
    pause
    exit /b
)
cd ..

echo.
color 0A
echo ===============================================================
echo   [EXITO] Plataforma actualizada correctamente a la ultima version!
echo ===============================================================
echo.
echo Presione cualquier tecla para iniciar el servidor en consola...
pause
start "" "Iniciar_Consola.bat"
exit /b
