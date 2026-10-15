@echo off
color 0B
title Desbloquear Firewall Windows - Plataforma SIMCE y PRUEBAS CCG

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
echo    Soporte para Produccion (:3300) y Pruebas (:3600)
echo ==========================================================
echo.
echo [1/4] Abriendo puerto TCP 3300 (Produccion LAN)...
netsh advfirewall firewall delete rule name="Plataforma Ensayos SIMCE (Puerto 3300)" >nul 2>&1
netsh advfirewall firewall add rule name="Plataforma Ensayos SIMCE (Puerto 3300)" dir=in action=allow protocol=TCP localport=3300 >nul 2>&1

echo [2/4] Abriendo puerto TCP 3001 (Produccion Backend)...
netsh advfirewall firewall delete rule name="Plataforma Ensayos SIMCE Backend (Puerto 3001)" >nul 2>&1
netsh advfirewall firewall add rule name="Plataforma Ensayos SIMCE Backend (Puerto 3001)" dir=in action=allow protocol=TCP localport=3001 >nul 2>&1

echo [3/4] Abriendo puerto TCP 3600 (Pruebas CCG LAN)...
netsh advfirewall firewall delete rule name="PRUEBAS CCG (Puerto 3600)" >nul 2>&1
netsh advfirewall firewall add rule name="PRUEBAS CCG (Puerto 3600)" dir=in action=allow protocol=TCP localport=3600 >nul 2>&1

echo [4/4] Abriendo puerto TCP 3601 (Pruebas CCG Backend)...
netsh advfirewall firewall delete rule name="PRUEBAS CCG Backend (Puerto 3601)" >nul 2>&1
netsh advfirewall firewall add rule name="PRUEBAS CCG Backend (Puerto 3601)" dir=in action=allow protocol=TCP localport=3601 >nul 2>&1

echo.
color 0A
echo ==========================================================
echo   [LISTO] Los puertos 3300 (Produccion) y 3600 (Pruebas)
echo   ahora aceptan conexiones desde la red local del colegio.
echo ==========================================================
echo.
pause
