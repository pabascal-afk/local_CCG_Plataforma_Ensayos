@echo off
cd /d "%~dp0"
title Servidor Plataforma Ensayos SIMCE - Puerto 3300
echo ===============================================================
echo   Iniciando Plataforma de Ensayos SIMCE (Colegio Cerro Grande)
echo ===============================================================

IF NOT EXIST "frontend\node_modules\next" (
    echo [INFO] Instalando modulos de frontend por primera vez...
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
