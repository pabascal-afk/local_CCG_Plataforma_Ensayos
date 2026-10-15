@echo off
color 0E
title Limpiar Ensayos de PRUEBAS CCG
cd /d "%~dp0"

echo "%~dp0" | findstr /I "pruebas" >nul
if %errorlevel% neq 0 (
    color 0C
    echo ===============================================================
    echo  [ACCESO DENEGADO POR SEGURIDAD]
    echo  Este script solo puede ejecutarse en la carpeta "PRUEBAS CCG".
    echo  No se ejecutara en la carpeta de produccion oficial.
    echo ===============================================================
    pause
    exit /b 1
)

echo ===============================================================
echo     Limpiar Ensayos y Resultados en PRUEBAS CCG (Puerto 3600)
echo ===============================================================
echo.
echo  Esta accion dejara la plataforma de PRUEBAS CCG en blanco:
echo  - Borrara: Ensayos, asignaciones y resultados de prueba.
echo  - Conservara: Cursos, profesores, estudiantes y administrador.
echo.
echo  Presione cualquier tecla para proceder o cierre esta ventana para cancelar.
pause

node backend\cleanPruebasData.js
echo.
pause
