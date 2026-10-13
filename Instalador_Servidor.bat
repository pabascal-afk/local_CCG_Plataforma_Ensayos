@echo off
color 0B
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

:: Configurar Git para redes locales (evitar problemas con certificados de red interna)
git config --global http.sslVerify false >nul 2>&1

:: 3. Revisar si ya esta clonado
IF EXIST ".git" (
    echo [INFO] Detectado como repositorio existente.
    echo [INFO] Deteniendo servidores en ejecucion si estaban encendidos...
    taskkill /F /IM node.exe >nul 2>&1
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
call npm install

echo.
echo ==========================================================
echo   [2/4] Configurando Backend y Base de Datos SQLite...
echo ==========================================================
cd backend
IF NOT EXIST ".env" (
    echo [INFO] Creando archivo backend\.env desde plantilla...
    copy ".env.example" ".env" >nul
)
call npm install
call npx prisma generate
call npx prisma migrate deploy

:: Verificar si existe la base de datos con datos o si requiere inicializacion
IF NOT EXIST "simce.db" (
    IF NOT EXIST "prisma\simce.db" (
        echo [INFO] Inicializando datos iniciales del colegio (Seed)...
        call npm run seed
    )
)
cd ..

echo.
echo ==========================================================
echo   [3/4] Instalando y compilando Frontend (Next.js)...
echo ==========================================================
cd frontend
call npm install
echo [INFO] Generando build optimizado para produccion...
call npm run build
cd ..

echo.
echo ==========================================================
echo   [4/4] Configurando Firewall y Acceso de Red Local (LAN)...
echo ==========================================================
:: Permitir puerto 8000 en el Firewall de Windows para conexion de otros equipos en la LAN
netsh advfirewall firewall show rule name="Plataforma Ensayos SIMCE (Puerto 8000)" >nul 2>&1
IF ERRORLEVEL 1 (
    echo [INFO] Creando regla de Firewall para puerto 8000 (LAN)...
    netsh advfirewall firewall add rule name="Plataforma Ensayos SIMCE (Puerto 8000)" dir=in action=allow protocol=TCP localport=8000 >nul 2>&1
)

:: Crear acceso directo en el Escritorio
echo [INFO] Creando acceso directo en el Escritorio...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Plataforma Ensayos SIMCE.lnk')); $s.TargetPath = [System.IO.Path]::Combine((Get-Location).Path, 'Iniciar_Plataforma.vbs'); $s.WorkingDirectory = (Get-Location).Path; $s.Description = 'Iniciar Plataforma de Ensayos SIMCE (Colegio Cerro Grande)'; if (Test-Path 'app.ico') { $s.IconLocation = (Join-Path (Get-Location).Path 'app.ico') } elseif (Test-Path 'CCG-logo-300x300.png') { $s.IconLocation = (Join-Path (Get-Location).Path 'CCG-logo-300x300.png') }; $s.Save()" >nul 2>&1

echo.
color 0A
echo ==========================================================
echo   [EXITO] Instalacion y configuracion completada con exito.
echo   La plataforma correra en el puerto 8000.
echo ==========================================================
echo.
echo Arrancando el servidor en segundo plano...
start "" "Iniciar_Plataforma.vbs"
timeout /t 5 >nul
exit /b
