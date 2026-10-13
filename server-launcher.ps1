param (
    [switch]$Hidden
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Kill any existing processes on these ports to prevent EADDRINUSE
try {
    Get-NetTCPConnection -LocalPort 3001, 5000 -ErrorAction SilentlyContinue | ForEach-Object {
        $pidToKill = $_.OwningProcess
        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
    }
} catch {}

# Start Backend
$backendDir = Join-Path $baseDir "backend"
$backend = Start-Process "node" -ArgumentList "src/index.js" -WorkingDirectory $backendDir -WindowStyle Hidden -RedirectStandardOutput "$baseDir\backend.log" -RedirectStandardError "$baseDir\backend-err.log" -PassThru

# Start Frontend (Next.js production server)
$frontendDir = Join-Path $baseDir "frontend"
$frontend = Start-Process "node" -ArgumentList "node_modules\next\dist\bin\next", "start", "-p", "5000" -WorkingDirectory $frontendDir -WindowStyle Hidden -RedirectStandardOutput "$baseDir\frontend.log" -RedirectStandardError "$baseDir\frontend-err.log" -PassThru

# Create System Tray Icon
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Get-Process -id $PID).Path) # Uses PowerShell icon
$notifyIcon.Text = "Plataforma SIMCE en ejecución"
$notifyIcon.Visible = $true

# Context Menu
$contextMenu = New-Object System.Windows.Forms.ContextMenu

$openMenuItem = New-Object System.Windows.Forms.MenuItem
$openMenuItem.Text = "Abrir en el Navegador"
$openMenuItem.add_Click({
    Start-Process "http://localhost:5000"
})

$exitMenuItem = New-Object System.Windows.Forms.MenuItem
$exitMenuItem.Text = "Apagar Servidor"
$exitMenuItem.add_Click({
    $notifyIcon.Visible = $false
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue
    # Also kill any lingering node processes spawned by next.js
    try {
        Get-NetTCPConnection -LocalPort 3001, 5000 -ErrorAction SilentlyContinue | ForEach-Object {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    } catch {}
    [System.Windows.Forms.Application]::Exit()
})

$contextMenu.MenuItems.Add($openMenuItem) | Out-Null
$contextMenu.MenuItems.Add("-") | Out-Null
$contextMenu.MenuItems.Add($exitMenuItem) | Out-Null

$notifyIcon.ContextMenu = $contextMenu

# Show a balloon tip to inform the user
$notifyIcon.ShowBalloonTip(3000, "Plataforma SIMCE", "El servidor se está ejecutando en segundo plano. Haz clic derecho en este ícono para apagarlo.", [System.Windows.Forms.ToolTipIcon]::Info)

# Wait a few seconds for servers to start, then open browser
Start-Sleep -Seconds 3
Start-Process "http://localhost:5000"

# Start the Windows Forms message loop
[System.Windows.Forms.Application]::Run()
