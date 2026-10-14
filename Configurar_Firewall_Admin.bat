@echo off
color 0B
title Desbloquear Firewall Windows - Plataforma SIMCE (Puerto 3300)

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
echo    Plataforma de Ensayos SIMCE (Colegio Cerro Grande)
echo ==========================================================
echo.
echo [1/2] Abriendo puerto TCP 3300 para conexion LAN...
netsh advfirewall firewall delete rule name="Plataforma Ensayos SIMCE (Puerto 3300)" >nul 2>&1
netsh advfirewall firewall add rule name="Plataforma Ensayos SIMCE (Puerto 3300)" dir=in action=allow protocol=TCP localport=3300
if %errorlevel% equ 0 (
    echo      ^--^> Puerto 3300 DESBLOQUEADO con exito.
) else (
    echo      ^--^> [ERROR] No se pudo agregar la regla.
)

echo.
echo [2/2] Abriendo puerto TCP 3001 para API de diagnostico...
netsh advfirewall firewall delete rule name="Plataforma Ensayos SIMCE Backend (Puerto 3001)" >nul 2>&1
netsh advfirewall firewall add rule name="Plataforma Ensayos SIMCE Backend (Puerto 3001)" dir=in action=allow protocol=TCP localport=3001 >nul 2>&1

echo.
color 0A
echo ==========================================================
echo   [LISTO] El puerto 3300 ahora acepta conexiones desde 
echo   cualquier equipo conectado a la red local del colegio.
echo ==========================================================
echo.
pause
