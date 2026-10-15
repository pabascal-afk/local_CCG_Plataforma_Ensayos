@echo off
color 0E
title Configurar e Iniciar PRUEBAS CCG (Puerto 3600)
cd /d "%~dp0"

echo ===============================================================
echo     Crear e Iniciar Instancia de PRUEBAS CCG (Puerto 3600)
echo              Colegio Cerro Grande (Red Local)
echo ===============================================================
echo.

set "DEST_DIR=..\PRUEBAS CCG"

IF NOT EXIST "%DEST_DIR%" (
    echo [1/5] Creando carpeta independiente para pruebas en "%DEST_DIR%"...
    git clone . "%DEST_DIR%" >nul 2>&1
    IF ERRORLEVEL 1 (
        echo [INFO] Clonando desde GitHub remoto...
        git clone https://github.com/pabascal-afk/local_CCG_Plataforma_Ensayos.git "%DEST_DIR%"
    )
    
    echo [2/5] Copiando dependencias ya instaladas para acelerar el inicio...
    if exist "node_modules" robocopy "node_modules" "%DEST_DIR%\node_modules" /E /MT:16 /NFL /NDL /NJH /NJS /nc /ns /np >nul
    if exist "backend\node_modules" robocopy "backend\node_modules" "%DEST_DIR%\backend\node_modules" /E /MT:16 /NFL /NDL /NJH /NJS /nc /ns /np >nul
    if exist "frontend\node_modules" robocopy "frontend\node_modules" "%DEST_DIR%\frontend\node_modules" /E /MT:16 /NFL /NDL /NJH /NJS /nc /ns /np >nul
    
    echo [3/5] Clonando base de datos SQLite y archivos para pruebas independientes...
    if exist "backend\prisma\simce.db" copy "backend\prisma\simce.db*" "%DEST_DIR%\backend\prisma\" >nul
    if exist "backend\uploads" (
        if not exist "%DEST_DIR%\backend\uploads" mkdir "%DEST_DIR%\backend\uploads"
        copy "backend\uploads\*" "%DEST_DIR%\backend\uploads\" >nul 2>&1
    )
    
    echo [4/5] Configurando backend en puerto 3601 (Frontend :3600)...
    (
        echo DATABASE_URL="file:./simce.db?connection_limit=1&socket_timeout=10"
        echo JWT_SECRET="5deea0503538dd87b4faa6afada5765cc96ca39dbb0167ccf0ac52566b73284686ceb9ff631020786a4aaae74ef95c74"
        echo PORT=3601
        echo HOST=127.0.0.1
        echo UPLOADS_DIR=./uploads
    ) > "%DEST_DIR%\backend\.env"

    echo [5/5] Creando accesos directos en el Escritorio...
    powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $d = [System.Environment]::GetFolderPath('Desktop'); $p = (Resolve-Path '%DEST_DIR%').Path; $s1 = $ws.CreateShortcut((Join-Path $d 'PRUEBAS CCG (Consola).lnk')); $s1.TargetPath = (Join-Path $p 'Iniciar_Consola.bat'); $s1.WorkingDirectory = $p; $s1.Save(); $s2 = $ws.CreateShortcut((Join-Path $d 'PRUEBAS CCG (Segundo Plano).lnk')); $s2.TargetPath = (Join-Path $p 'Iniciar_Plataforma.vbs'); $s2.WorkingDirectory = $p; $s2.Save();" >nul 2>&1
) ELSE (
    echo [INFO] La carpeta "%DEST_DIR%" ya existe. Sincronizando...
    cd "%DEST_DIR%"
    git pull origin main >nul 2>&1
    cd /d "%~dp0"
)

echo.
color 0A
echo ===============================================================
echo   [LISTO] La instancia PRUEBAS CCG esta lista para arrancar.
echo   - Produccion: http://localhost:3300
echo   - Pruebas:    http://localhost:3600
echo ===============================================================
echo.
echo Iniciando PRUEBAS CCG en una nueva ventana...
start "" "%DEST_DIR%\Iniciar_Consola.bat"
exit /b
