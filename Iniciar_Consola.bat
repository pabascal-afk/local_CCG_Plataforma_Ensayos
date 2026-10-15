@echo off
cd /d "%~dp0"

echo "%~dp0" | findstr /I "pruebas" >nul
if %errorlevel% equ 0 goto :IS_PRUEBAS

title Servidor Plataforma Ensayos SIMCE - Puerto 3300
echo ===============================================================
echo   Iniciando Plataforma de Ensayos SIMCE - Puerto 3300
echo ===============================================================
goto :CHECK_MODULES

:IS_PRUEBAS
title Servidor PRUEBAS CCG - Puerto 3600
echo ===============================================================
echo   Iniciando PRUEBAS CCG - Puerto 3600
echo ===============================================================

:CHECK_MODULES
if not exist "frontend\node_modules\qrcode" (
    echo [INFO] Instalando modulos de frontend: qrcode, jsqr...
    cd frontend
    call npm install --no-audit
    cd /d "%~dp0"
)

if not exist "backend\node_modules\@prisma" (
    echo [INFO] Instalando modulos de backend por primera vez...
    cd backend
    call npm install --no-audit
    cd /d "%~dp0"
)

node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] El servidor se detuvo con errores.
)
pause
