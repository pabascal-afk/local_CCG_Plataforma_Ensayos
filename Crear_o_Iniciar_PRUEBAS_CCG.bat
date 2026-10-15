@echo off
color 0E
title Configurar e Iniciar PRUEBAS CCG (Puerto 3600)
cd /d "%~dp0"

echo ===============================================================
echo     Crear e Iniciar Instancia de PRUEBAS CCG (Puerto 3600)
echo              Colegio Cerro Grande (Red Local)
echo ===============================================================
echo.

set "DEST_DIR=%~dp0..\PRUEBAS CCG"

IF EXIST "%DEST_DIR%\server.js" GOTO :EXISTING_INSTALL

:NEW_INSTALL
echo [1/5] Creando carpeta independiente para pruebas en:
echo       "%DEST_DIR%"
echo.
git clone . "%DEST_DIR%"
IF ERRORLEVEL 1 (
    echo [INFO] Clonando desde GitHub remoto...
    git clone https://github.com/pabascal-afk/local_CCG_Plataforma_Ensayos.git "%DEST_DIR%"
    IF ERRORLEVEL 1 (
        color 0C
        echo [ERROR] No se pudo clonar el repositorio en "%DEST_DIR%".
        pause
        exit /b 1
    )
)

echo.
echo [2/5] Copiando modulos de dependencias para acelerar el inicio...
if exist "node_modules" (
    echo      Copiando dependencias raiz...
    robocopy "node_modules" "%DEST_DIR%\node_modules" /E /MT:16 /NFL /NDL /NJH /NJS /nc /ns /np >nul
)
if exist "backend\node_modules" (
    echo      Copiando dependencias backend...
    robocopy "backend\node_modules" "%DEST_DIR%\backend\node_modules" /E /MT:16 /NFL /NDL /NJH /NJS /nc /ns /np >nul
)
if exist "frontend\node_modules" (
    echo      Copiando dependencias frontend...
    robocopy "frontend\node_modules" "%DEST_DIR%\frontend\node_modules" /E /MT:16 /NFL /NDL /NJH /NJS /nc /ns /np >nul
)

echo.
echo [3/5] Configurando base de datos aislada para PRUEBAS CCG...
if not exist "%DEST_DIR%\backend\prisma" mkdir "%DEST_DIR%\backend\prisma"
if exist "backend\prisma\simce.db" (
    copy "backend\prisma\simce.db*" "%DEST_DIR%\backend\prisma\" >nul 2>&1
    echo      Base de datos SQLite de usuarios y cursos copiada.
    if exist "%DEST_DIR%\backend\cleanPruebasData.js" (
        node "%DEST_DIR%\backend\cleanPruebasData.js" >nul 2>&1
        echo      Ensayos y resultados previos limpiados para garantizar total independencia.
    )
)
if not exist "%DEST_DIR%\backend\uploads" mkdir "%DEST_DIR%\backend\uploads"

echo.
echo [4/5] Configurando backend en puerto 3601 (Frontend en puerto 3600)...
echo DATABASE_URL="file:./simce.db?connection_limit=1&socket_timeout=10" > "%DEST_DIR%\backend\.env"
echo JWT_SECRET="5deea0503538dd87b4faa6afada5765cc96ca39dbb0167ccf0ac52566b73284686ceb9ff631020786a4aaae74ef95c74" >> "%DEST_DIR%\backend\.env"
echo PORT=3601 >> "%DEST_DIR%\backend\.env"
echo HOST=127.0.0.1 >> "%DEST_DIR%\backend\.env"
echo UPLOADS_DIR=./uploads >> "%DEST_DIR%\backend\.env"

echo.
echo [5/5] Creando accesos directos en el Escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { try { $ws = New-Object -ComObject WScript.Shell; $d = [System.Environment]::GetFolderPath('Desktop'); $p = (Resolve-Path '%DEST_DIR%').Path; $s1 = $ws.CreateShortcut((Join-Path $d 'PRUEBAS CCG (Consola).lnk')); $s1.TargetPath = (Join-Path $p 'Iniciar_Consola.bat'); $s1.WorkingDirectory = $p; $s1.Save(); $s2 = $ws.CreateShortcut((Join-Path $d 'PRUEBAS CCG (Segundo Plano).lnk')); $s2.TargetPath = (Join-Path $p 'Iniciar_Plataforma.vbs'); $s2.WorkingDirectory = $p; $s2.Save(); Write-Output '     Accesos directos creados correctamente.' } catch {} }"

GOTO :LAUNCH_SERVER

:EXISTING_INSTALL
echo [INFO] La instancia "%DEST_DIR%" ya existe.
echo [INFO] Sincronizando con los ultimos cambios de GitHub (origin/main)...
cd /d "%DEST_DIR%"
git config --global http.sslVerify false >nul 2>&1
git fetch origin main >nul 2>&1
git pull origin main >nul 2>&1
cd /d "%~dp0"

:LAUNCH_SERVER
echo.
color 0A
echo ===============================================================
echo   [EXITO] La instancia PRUEBAS CCG esta lista para arrancar.
echo   - Produccion: http://localhost:3300 (o IP_SERVIDOR:3300)
echo   - Pruebas:    http://localhost:3600 (o IP_SERVIDOR:3600)
echo ===============================================================
echo.
echo Presione cualquier tecla para iniciar el servidor de pruebas en consola...
pause
cd /d "%DEST_DIR%"
start "" "Iniciar_Consola.bat"
exit /b
