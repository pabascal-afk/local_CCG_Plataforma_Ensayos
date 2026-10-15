@echo off
color 0B
title Desbloquear Firewall Windows - PRUEBAS CCG (Puerto 3600)

:: Auto-elevación a permisos de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permisos de Administrador...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ==========================================================
echo    Configuracion de Firewall de Windows para Red Local
echo    PRUEBAS CCG (Puerto 3600 - Colegio Cerro Grande)
echo ==========================================================
echo.
echo [1/2] Abriendo puerto TCP 3600 para conexion LAN...
netsh advfirewall firewall delete rule name="PRUEBAS CCG (Puerto 3600)" >nul 2>&1
netsh advfirewall firewall add rule name="PRUEBAS CCG (Puerto 3600)" dir=in action=allow protocol=TCP localport=3600
if %errorlevel% equ 0 (
    echo      ^--^> Puerto 3600 DESBLOQUEADO con exito.
) else (
    echo      ^--^> [ERROR] No se pudo agregar la regla.
)

echo.
echo [2/2] Abriendo puerto TCP 3601 para API interna...
netsh advfirewall firewall delete rule name="PRUEBAS CCG Backend (Puerto 3601)" >nul 2>&1
netsh advfirewall firewall add rule name="PRUEBAS CCG Backend (Puerto 3601)" dir=in action=allow protocol=TCP localport=3601 >nul 2>&1

echo.
color 0A
echo ==========================================================
echo   [LISTO] El puerto 3600 ahora acepta conexiones desde 
echo   cualquier equipo conectado a la red local del colegio.
echo ==========================================================
echo.
pause
