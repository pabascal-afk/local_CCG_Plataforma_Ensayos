@echo off
cd /d "%~dp0"

echo "%~dp0" | findstr /I "pruebas" >nul
if %errorlevel% equ 0 goto :IS_PRUEBAS

echo ===============================================================
echo   Iniciando Plataforma de Ensayos SIMCE - Puerto 3300
echo ===============================================================
echo El servidor esta arrancando en segundo plano en el puerto 3300.
goto :START_VBS

:IS_PRUEBAS
echo ===============================================================
echo   Iniciando PRUEBAS CCG - Puerto 3600
echo ===============================================================
echo El servidor de pruebas esta arrancando en segundo plano en el puerto 3600.

:START_VBS
echo Aparecera el icono institucional junto al reloj de Windows.
echo.
start "" "Iniciar_Plataforma.vbs"
timeout /t 3 >nul
exit /b
