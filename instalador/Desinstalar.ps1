# =========================================================
# Ingeap - Desinstalador de Accesos Directos y Auto-Inicio
# Check Diario de Asistencia y Proyectos
# =========================================================

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "       Desinstalacion de Check Diario - Ingeap               " -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Yellow

# 1. Cerrar procesos en ejecucion
$Running = Get-Process -Name "CheckDiarioIngeap" -ErrorAction SilentlyContinue
if ($Running) {
    Write-Host "Cerrando aplicacion en ejecucion..." -ForegroundColor Cyan
    $Running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$ProgramsPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Programs)
$StartupPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)

# 2. Eliminar acceso directo del Escritorio
$ShortcutDesktop = Join-Path $DesktopPath "Check Diario - Ingeap.lnk"
if (Test-Path $ShortcutDesktop) {
    Remove-Item $ShortcutDesktop -Force -ErrorAction SilentlyContinue
    Write-Host " [OK] Acceso directo eliminado del Escritorio." -ForegroundColor White
}

# 3. Eliminar acceso directo del Menú de Inicio
$ShortcutMenu = Join-Path $ProgramsPath "Check Diario - Ingeap.lnk"
if (Test-Path $ShortcutMenu) {
    Remove-Item $ShortcutMenu -Force -ErrorAction SilentlyContinue
    Write-Host " [OK] Acceso directo eliminado del Menu de Inicio." -ForegroundColor White
}

# 4. Eliminar acceso directo de carpeta Startup
$StartupShortcut = Join-Path $StartupPath "Check Diario - Ingeap.lnk"
if (Test-Path $StartupShortcut) {
    Remove-Item $StartupShortcut -Force -ErrorAction SilentlyContinue
}

# [FN-00.10] Retirar únicamente la tarea del usuario actual
try {
    $Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $Scheduler = New-Object -ComObject 'Schedule.Service'
    $Scheduler.Connect()
    $Folder = $Scheduler.GetFolder('\')
    $Task = $Folder.GetTask(('CheckDiarioIngeap-' + $Sid))
    $ConfigDir = [IO.Path]::GetDirectoryName($Task.Definition.Actions.Item(1).Path)
    if ((Split-Path -Leaf $ConfigDir) -eq 'app') { $ConfigDir = Split-Path -Parent $ConfigDir }
    $ConfigPath = Join-Path $ConfigDir 'inicio_automatico.json'
    @{exito=$true; habilitado=[bool]$Task.Enabled; demora=90} | ConvertTo-Json -Compress | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
    $Folder.DeleteTask(('CheckDiarioIngeap-' + $Sid), 0)
} catch {
    Write-Host 'No existe una tarea de inicio de Check Diario o Windows no permitió retirarla.'
}

# 5. Eliminar autoinicio del Registro de Windows
$RegistryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
try {
    Remove-ItemProperty -Path $RegistryPath -Name "CheckDiarioIngeap" -ErrorAction SilentlyContinue
    Write-Host " [OK] Registro de inicio automatico eliminado." -ForegroundColor White
} catch {
    # Ignorar si no existia
}

Write-Host "============================================================" -ForegroundColor Yellow
Write-Host " Desinstalacion completada con exito." -ForegroundColor Green
Write-Host " (Los datos locales en AppData se han conservado por seguridad)" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 3
