# =========================================================
# Ingeap - Instalador de Acceso Directo y Auto-Inicio
# Check Diario de Asistencia y Proyectos
# =========================================================

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent -Path $MyInvocation.MyCommand.Definition }
$ExePath = Join-Path $ScriptDir "CheckDiarioIngeap.exe"

if (-not (Test-Path $ExePath)) {
    Write-Host ""
    Write-Host "Error: No se encontro el ejecutable 'CheckDiarioIngeap.exe' en esta carpeta:" -ForegroundColor Red
    Write-Host "       $ScriptDir" -ForegroundColor Yellow
    Write-Host ""
    Pause
    exit
}

# 1. Cerrar instancias previas en ejecucion para evitar bloqueos
$Running = Get-Process -Name "CheckDiarioIngeap" -ErrorAction SilentlyContinue
if ($Running) {
    Write-Host "Cerrando instancia en ejecucion de Check Diario..." -ForegroundColor Yellow
    $Running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# 2. Desbloquear el archivo en Windows (elimina restriccion SmartScreen de archivos descargados)
try {
    Unblock-File -Path "$ExePath" -ErrorAction SilentlyContinue
} catch {
    # Continuar si no requiere desbloqueo
}

$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$ProgramsPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Programs)
$StartupPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)

# 3. Acceso directo en el Escritorio
$ShortcutDesktop = Join-Path $DesktopPath "Check Diario - Ingeap.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutDesktop)
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "Check Diario de Asistencia y Proyectos - Ingeap"
$Shortcut.IconLocation = "$ExePath,0"
$Shortcut.Save()

# 4. Acceso directo en el Menú de Inicio (Programas)
$ShortcutMenu = Join-Path $ProgramsPath "Check Diario - Ingeap.lnk"
$ShortcutStart = $WshShell.CreateShortcut($ShortcutMenu)
$ShortcutStart.TargetPath = $ExePath
$ShortcutStart.WorkingDirectory = $ScriptDir
$ShortcutStart.Description = "Check Diario de Asistencia y Proyectos - Ingeap"
$ShortcutStart.IconLocation = "$ExePath,0"
$ShortcutStart.Save()

# 5. Limpieza de accesos directos obsoletos en Carpeta Startup (para evitar doble inicio)
$StartupShortcutPath = Join-Path $StartupPath "Check Diario - Ingeap.lnk"
if (Test-Path $StartupShortcutPath) {
    Remove-Item $StartupShortcutPath -Force -ErrorAction SilentlyContinue
}

# 6. Registrar inicio automatico en el Registro de Windows (HKCU\Run)
$RegistryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $RegistryPath -Name "CheckDiarioIngeap" -Value "`"$ExePath`""

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "       Configuracion completada exitosamente                " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [OK] Acceso directo creado en el Escritorio." -ForegroundColor White
Write-Host " [OK] Acceso directo agregado al Menu de Inicio de Windows." -ForegroundColor White
Write-Host " [OK] Configurado para iniciar con Windows (Registro HKCU)." -ForegroundColor White
Write-Host " [OK] Limpieza de inicios duplicados realizada." -ForegroundColor White
Write-Host " [OK] Permisos de ejecucion de Windows actualizados." -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ya puedes abrir 'Check Diario - Ingeap' desde tu Escritorio o Menu Inicio." -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
