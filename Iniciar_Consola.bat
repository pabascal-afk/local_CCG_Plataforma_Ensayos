@echo off
cd /d "%~dp0"
echo "%~dp0" | findstr /I "pruebas" >nul
if %errorlevel% equ 0 (
    title Servidor PRUEBAS CCG - Puerto 3600
    echo ===============================================================
    echo   Iniciando PRUEBAS CCG (Puerto 3600 - Colegio Cerro Grande)
    echo ===============================================================
) else (
    title Servidor Plataforma Ensayos SIMCE - Puerto 3300
    echo ===============================================================
    echo   Iniciando Plataforma de Ensayos SIMCE (Colegio Cerro Grande)
    echo ===============================================================
)

IF NOT EXIST "frontend\node_modules\qrcode" (
    echo [INFO] Instalando modulos de frontend (qrcode, jsqr, etc)...
    cd frontend
    call npm install --no-audit
    cd ..
)

IF NOT EXIST "backend\node_modules\@prisma" (
    echo [INFO] Instalando modulos de backend por primera vez...
    cd backend
    call npm install --no-audit
    cd ..
)

node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] El servidor se detuvo con errores.
)
pause
