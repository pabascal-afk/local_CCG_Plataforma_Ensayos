@echo off
color 0B
title Instalador / Actualizador - Plataforma Ensayos SIMCE (Colegio Cerro Grande)

:: 0. Auto-elevación a permisos de Administrador (indispensable para Firewall de Windows y servicios)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Solicitando permisos de Administrador para configurar Firewall de Windows...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ==========================================================
echo    Instalador / Actualizador - Plataforma Ensayos SIMCE
echo              Colegio Cerro Grande (Red Local)
echo ==========================================================
echo.

:: 1. Verificar Git
git --version >nul 2>&1
IF ERRORLEVEL 1 (
    color 0C
    echo [ERROR] Git no esta instalado. Descargalo de https://git-scm.com/
    pause
    exit /b
)

:: 2. Verificar Node.js
node --version >nul 2>&1
IF ERRORLEVEL 1 (
    color 0C
    echo [ERROR] Node.js no esta instalado. Descargalo de https://nodejs.org/
    pause
    exit /b
)

:: Configurar Git para redes locales
git config --global http.sslVerify false >nul 2>&1

:: 3. Revisar si ya esta clonado
IF EXIST ".git" (
    echo [INFO] Detectado como repositorio existente.
    echo [INFO] Deteniendo servidores y liberando puerto 3300 si estaba ocupado...
    powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3300 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1
    echo [INFO] Obteniendo actualizaciones desde GitHub...
    git pull origin main
) ELSE (
    echo [INFO] Iniciando instalacion por primera vez...
    echo [INFO] Clonando repositorio desde GitHub...
    git clone https://github.com/pabascal-afk/local_CCG_Plataforma_Ensayos.git .
    IF ERRORLEVEL 1 (
        color 0C
        echo [ERROR] Hubo un problema al clonar el repositorio.
        pause
        exit /b
    )
)

echo.
echo ==========================================================
echo   [1/4] Instalando dependencias del sistema principal...
echo ==========================================================
call npm install --no-audit

echo.
echo ==========================================================
echo   [2/4] Configurando Backend y Base de Datos SQLite...
echo ==========================================================
cd backend
IF NOT EXIST ".env" (
    echo [INFO] Creando archivo backend\.env desde plantilla...
    copy ".env.example" ".env" >nul
)
call npm install --no-audit
call npx prisma generate
call npx prisma migrate deploy

:: Si no existe la base de datos o si se desea dejar solo el usuario admin
IF NOT EXIST "simce.db" (
    IF NOT EXIST "prisma\simce.db" (
        echo [INFO] Creando base de datos con usuario administrador (admin123)...
        call node clean-db.js
    )
)
cd ..

echo.
echo ==========================================================
echo   [3/4] Instalando y compilando Frontend (Next.js)...
echo ==========================================================
cd frontend
call npm install --no-audit
echo [INFO] Generando build optimizado para produccion en puerto 3300...
call npm run build
IF ERRORLEVEL 1 (
    color 0C
    echo [ERROR] Fallo la compilacion del Frontend Next.js.
    pause
    exit /b
)
cd ..

echo.
echo ==========================================================
echo   [4/4] Configurando Firewall y Acceso de Red Local (LAN)...
echo ==========================================================
echo [INFO] Creando/Actualizando regla de Firewall para puerto 3300 (LAN)...
netsh advfirewall firewall delete rule name="Plataforma Ensayos SIMCE (Puerto 3300)" >nul 2>&1
netsh advfirewall firewall add rule name="Plataforma Ensayos SIMCE (Puerto 3300)" dir=in action=allow protocol=TCP localport=3300 >nul 2>&1

:: Crear acceso directo en el Escritorio
echo [INFO] Creando accesos directos en el Escritorio...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Plataforma Ensayos SIMCE (Segundo Plano).lnk')); $s.TargetPath = [System.IO.Path]::Combine((Get-Location).Path, 'Iniciar_Plataforma.vbs'); $s.WorkingDirectory = (Get-Location).Path; $s.Description = 'Iniciar Plataforma SIMCE en Segundo Plano'; if (Test-Path 'app.ico') { $s.IconLocation = (Join-Path (Get-Location).Path 'app.ico') }; $s.Save()" >nul 2>&1
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Plataforma Ensayos SIMCE (Consola).lnk')); $s.TargetPath = [System.IO.Path]::Combine((Get-Location).Path, 'Iniciar_Consola.bat'); $s.WorkingDirectory = (Get-Location).Path; $s.Description = 'Iniciar Plataforma SIMCE en Consola'; if (Test-Path 'app.ico') { $s.IconLocation = (Join-Path (Get-Location).Path 'app.ico') }; $s.Save()" >nul 2>&1

echo.
color 0A
echo ==========================================================
echo   [EXITO] Instalacion y configuracion completada con exito.
echo   La plataforma esta lista en el puerto 3300.
echo ==========================================================
echo.
echo Arrancando el servidor...
start "" "Iniciar_Plataforma.vbs"
timeout /t 4 >nul
exit /b
