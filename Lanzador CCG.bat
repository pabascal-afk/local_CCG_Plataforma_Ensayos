@echo off
cd /d "%~dp0"
echo ===============================================================
echo   Iniciando Plataforma de Ensayos SIMCE (Colegio Cerro Grande)
echo ===============================================================
echo El servidor esta arrancando en segundo plano en el puerto 3300.
echo Aparecera el icono institucional junto al reloj de Windows.
echo.
start "" "Iniciar_Plataforma.vbs"
timeout /t 3 >nul
exit /b
