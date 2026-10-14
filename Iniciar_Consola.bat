@echo off
cd /d "%~dp0"
title Servidor Plataforma Ensayos SIMCE - Puerto 3300
echo ===============================================================
echo   Iniciando Plataforma de Ensayos SIMCE (Colegio Cerro Grande)
echo ===============================================================
node server.js
pause
