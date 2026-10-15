@echo off
cd /d "%~dp0"
echo ===============================================================
echo   Iniciando PRUEBAS CCG (Puerto 3600 - Colegio Cerro Grande)
echo ===============================================================
echo El servidor de pruebas esta arrancando en segundo plano en el puerto 3600.
echo Aparecera el icono institucional junto al reloj de Windows.
echo.
start "" "Iniciar_Plataforma.vbs"
timeout /t 3 >nul
exit /b
