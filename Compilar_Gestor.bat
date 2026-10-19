@echo off
cd /d "%~dp0"
echo Compilando Gestor_Servidores_CCG.exe con .NET Framework...
"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /target:winexe /out:"Gestor_Servidores_CCG.exe" /win32icon:"app.ico" /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Net.Http.dll /r:System.Core.dll ServerManager.cs
if %errorlevel% equ 0 (
    echo [OK] Gestor_Servidores_CCG.exe compilado exitosamente.
) else (
    echo [ERROR] Fallo la compilacion de Gestor_Servidores_CCG.exe.
    pause
)
