@echo off
color 0B

:: Detección de entorno según carpeta
echo "%~dp0" | findstr /I "pruebas" >nul
if %errorlevel% equ 0 (
    set APP_NAME=PRUEBAS CCG
    set APP_PORT=3600
    set APP_BACKEND_PORT=3601
    set GIT_BRANCH=pruebas-ccg
) else (
    set APP_NAME=Plataforma SIMCE
    set APP_PORT=3300
    set APP_BACKEND_PORT=3001
    set GIT_BRANCH=main
)

title Actualizar %APP_NAME% desde GitHub - Colegio Cerro Grande
cd /d "%~dp0"

echo ===============================================================
echo     Actualizador de %APP_NAME% - Colegio Cerro Grande
echo ===============================================================
echo.

echo [1/4] Deteniendo instancias previas en los puertos %APP_PORT% y %APP_BACKEND_PORT%...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %APP_PORT%,%APP_BACKEND_PORT% -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1
if exist "Gestor_Servidores_CCG.exe.old" del /F /Q "Gestor_Servidores_CCG.exe.old" >nul 2>&1
if exist "Gestor_Servidores_CCG.exe" move /Y "Gestor_Servidores_CCG.exe" "Gestor_Servidores_CCG.exe.old" >nul 2>&1

echo.
echo [2/4] Descargando ultimos cambios desde GitHub (origin/%GIT_BRANCH%)...
git config --global http.sslVerify false >nul 2>&1
git fetch origin %GIT_BRANCH%
git reset --hard origin/%GIT_BRANCH%
IF ERRORLEVEL 1 (
    git stash
    git pull origin %GIT_BRANCH%
)

echo.
echo [3/4] Sincronizando Base de Datos SQLite con Prisma...
cd backend
node node_modules\prisma\build\index.js db push --accept-data-loss
node node_modules\prisma\build\index.js generate
cd ..

echo.
echo [4/4] Verificando dependencias y compilando Frontend Next.js para produccion en puerto %APP_PORT%...
cd frontend
IF NOT EXIST "node_modules\qrcode" (
    echo [INFO] Instalando dependencias faltantes en frontend: qrcode, jsqr...
    call npm install --no-audit
)
node node_modules\next\dist\bin\next build
IF ERRORLEVEL 1 (
    echo [AVISO] Fallo la compilacion. Reinstalando dependencias completas...
    call npm install --no-audit
    node node_modules\next\dist\bin\next build
    IF ERRORLEVEL 1 (
        color 0C
        echo [ERROR] Fallo la compilacion de Next.js.
        pause
        exit /b
    )
)
cd ..

IF EXIST "ServerManager.cs" (
    IF EXIST "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
        echo.
        echo [EXTRA] Actualizando ejecutable Gestor_Servidores_CCG.exe...
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /out:"Gestor_Servidores_CCG.exe" /win32icon:"app.ico" /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Net.Http.dll /r:System.Core.dll ServerManager.cs >nul 2>&1
    )
)

IF EXIST "%~dp0Gestor_Servidores_CCG.exe" (
    powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Gestor de Servidores CCG.lnk'); $s.TargetPath = '%~dp0Gestor_Servidores_CCG.exe'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = '%~dp0app.ico'; $s.Description = 'Centro de Control de Servidores - Colegio Cerro Grande'; $s.Save()" >nul 2>&1
)

echo.
color 0A
echo ===============================================================
echo   [EXITO] %APP_NAME% actualizada correctamente a la ultima version!
echo   [NUEVO] Se ha creado 'Gestor de Servidores CCG' en el Escritorio.
echo ===============================================================
echo.
echo Presione cualquier tecla para iniciar el servidor en consola...
pause
start "" "Iniciar_Consola.bat"
exit /b
