@echo off
color 0E
cd /d "%~dp0\backend"
echo ==========================================================
echo   Vaciando Base de Datos - Plataforma Ensayos SIMCE
echo   Dejando unicamente el usuario Administrador (admin123)
echo ==========================================================
echo.
node clean-db.js
echo.
pause
