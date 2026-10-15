@echo off
color 0B

:: Detección de entorno según carpeta
echo "%~dp0" | findstr /I "pruebas" >nul
if %errorlevel% equ 0 (
    set IS_PRUEBAS=1
    set APP_NAME=PRUEBAS CCG
    set APP_PORT=3600
    set APP_BACKEND_PORT=3601
) else (
    set IS_PRUEBAS=0
    set APP_NAME=Plataforma Ensayos SIMCE
    set APP_PORT=3300
    set APP_BACKEND_PORT=3001
)

title Instalador / Actualizador - %APP_NAME% (Puerto %APP_PORT%)

:: 0. Auto-elevación a permisos de Administrador (indispensable para Firewall de Windows y servicios)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Solicitando permisos de Administrador para configurar Firewall de Windows...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/k `\"%~f0`\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ==========================================================
echo    Instalador / Actualizador - %APP_NAME%
echo              Colegio Cerro Grande (Puerto %APP_PORT%)
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
    echo [INFO] Repositorio detectado.
    echo [INFO] Deteniendo servidores y liberando puertos %APP_PORT% y %APP_BACKEND_PORT%...
    powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %APP_PORT%,%APP_BACKEND_PORT% -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1
    echo [INFO] Obteniendo actualizaciones desde GitHub...
    git fetch origin main
    git pull origin main
    IF ERRORLEVEL 1 (
        echo [AVISO] git pull tuvo dificultades por archivos locales modificados.
        echo [INFO] Guardando cambios locales y sincronizando con origin/main...
        git stash
        git pull origin main
    )
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
echo   [1/3] Configurando Backend y Base de Datos SQLite...
echo ==========================================================
cd backend
IF NOT EXIST ".env" (
    echo [INFO] Creando archivo backend\.env para puerto %APP_BACKEND_PORT%...
    echo DATABASE_URL="file:./simce.db?connection_limit=1&socket_timeout=10" > .env
    echo JWT_SECRET="5deea0503538dd87b4faa6afada5765cc96ca39dbb0167ccf0ac52566b73284686ceb9ff631020786a4aaae74ef95c74" >> .env
    echo PORT=%APP_BACKEND_PORT% >> .env
    echo HOST=127.0.0.1 >> .env
    echo UPLOADS_DIR=./uploads >> .env
)
IF NOT EXIST "node_modules" (
    echo [INFO] Instalando modulos de backend...
    call npm install --no-audit
)
echo [INFO] Sincronizando esquema de base de datos con Prisma...
node node_modules\prisma\build\index.js db push --accept-data-loss
node node_modules\prisma\build\index.js generate

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
echo   [2/3] Instalando y compilando Frontend (Next.js)...
echo ==========================================================
cd frontend
IF NOT EXIST "node_modules\qrcode" (
    echo [INFO] Instalando dependencias de frontend: qrcode, jsqr...
    call npm install --no-audit
) ELSE (
    IF NOT EXIST "node_modules" (
        echo [INFO] Instalando modulos de frontend...
        call npm install --no-audit
    )
)
echo [INFO] Generando build optimizado para produccion en puerto %APP_PORT%...
node node_modules\next\dist\bin\next build
IF ERRORLEVEL 1 (
    echo [AVISO] Fallo la compilacion. Reinstalando dependencias de frontend...
    call npm install --no-audit
    node node_modules\next\dist\bin\next build
    IF ERRORLEVEL 1 (
        color 0C
        echo [ERROR] Fallo la compilacion del Frontend Next.js.
        pause
        exit /b
    )
)
cd ..

echo.
echo ==========================================================
echo   [3/3] Configurando Firewall y Acceso de Red Local (LAN)...
echo ==========================================================
echo [INFO] Creando/Actualizando reglas de Firewall para puertos %APP_PORT% y %APP_BACKEND_PORT% (LAN)...
netsh advfirewall firewall delete rule name="%APP_NAME% (Puerto %APP_PORT%)" >nul 2>&1
netsh advfirewall firewall add rule name="%APP_NAME% (Puerto %APP_PORT%)" dir=in action=allow protocol=TCP localport=%APP_PORT% >nul 2>&1
netsh advfirewall firewall delete rule name="%APP_NAME% Backend (Puerto %APP_BACKEND_PORT%)" >nul 2>&1
netsh advfirewall firewall add rule name="%APP_NAME% Backend (Puerto %APP_BACKEND_PORT%)" dir=in action=allow protocol=TCP localport=%APP_BACKEND_PORT% >nul 2>&1

:: Crear acceso directo en el Escritorio
echo [INFO] Creando accesos directos en el Escritorio...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), '%APP_NAME% (Segundo Plano).lnk')); $s.TargetPath = [System.IO.Path]::Combine((Get-Location).Path, 'Iniciar_Plataforma.vbs'); $s.WorkingDirectory = (Get-Location).Path; $s.Description = 'Iniciar %APP_NAME% en Segundo Plano (Puerto %APP_PORT%)'; if (Test-Path 'app.ico') { $s.IconLocation = (Join-Path (Get-Location).Path 'app.ico') }; $s.Save()" >nul 2>&1
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), '%APP_NAME% (Consola).lnk')); $s.TargetPath = [System.IO.Path]::Combine((Get-Location).Path, 'Iniciar_Consola.bat'); $s.WorkingDirectory = (Get-Location).Path; $s.Description = 'Iniciar %APP_NAME% en Consola (Puerto %APP_PORT%)'; if (Test-Path 'app.ico') { $s.IconLocation = (Join-Path (Get-Location).Path 'app.ico') }; $s.Save()" >nul 2>&1

echo.
color 0A
echo ==========================================================
echo   [EXITO] Instalacion y configuracion completada con exito.
echo   El servidor %APP_NAME% esta listo en el puerto %APP_PORT%.
echo ==========================================================
echo.
echo Presione cualquier tecla para iniciar el servidor...
pause
start "" "Iniciar_Consola.bat"
exit /b
