# =========================================================
# Ingeap - Instalador de Acceso Directo y Auto-Inicio
# Check Diario de Asistencia y Proyectos
# =========================================================

$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$StartupPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$ExePath = Join-Path $PSScriptRoot "CheckDiarioIngeap.exe"

if (-not (Test-Path $ExePath)) {
    Write-Host "Error: No se encontro el ejecutable CheckDiarioIngeap.exe en esta carpeta." -ForegroundColor Red
    Pause
    exit
}

# 1. Desbloquear el archivo en Windows (elimina restriccion de SmartScreen de archivos descargados)
try {
    Unblock-File -Path "$ExePath" -ErrorAction SilentlyContinue
} catch {
    # Ignorar si no requiere desbloqueo
}

# 2. Acceso directo en el Escritorio
$ShortcutPath = Join-Path $DesktopPath "Check Diario - Ingeap.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "Check Diario de Asistencia y Proyectos - Ingeap"
$Shortcut.IconLocation = "$ExePath,0"
$Shortcut.Save()

# 3. Acceso directo en la Carpeta de Inicio de Windows (arranque automatico con la PC)
$StartupShortcutPath = Join-Path $StartupPath "Check Diario - Ingeap.lnk"
$StartupShortcut = $WshShell.CreateShortcut($StartupShortcutPath)
$StartupShortcut.TargetPath = $ExePath
$StartupShortcut.WorkingDirectory = $PSScriptRoot
$StartupShortcut.Description = "Check Diario - Ingeap (Inicio automatico)"
$StartupShortcut.IconLocation = "$ExePath,0"
$StartupShortcut.Save()

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "       Configuracion completada exitosamente                " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " 1. Acceso directo creado en el Escritorio." -ForegroundColor White
Write-Host " 2. Configurado para iniciar automaticamente al encender Windows." -ForegroundColor White
Write-Host " 3. Permisos de ejecucion de Windows actualizados." -ForegroundColor White
Write-Host ""
Write-Host "Ya puedes abrir 'Check Diario - Ingeap' desde tu Escritorio."
Write-Host ""
Start-Sleep -Seconds 4
