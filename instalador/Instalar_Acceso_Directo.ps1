# [FN-00.11] Instalar el paquete completo antes de crear accesos e inicio automático
$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$Installer = Join-Path $ScriptDir 'Instalador_CheckDiario_Ingeap.exe'
if (-not (Test-Path -LiteralPath $Installer)) {
    $Installer = Join-Path $ScriptDir 'CheckDiarioIngeap.exe'
}
if (-not (Test-Path -LiteralPath $Installer)) {
    Write-Error 'No se encontró el instalador autocontenido de Check Diario.'
    exit 1
}
$Process = Start-Process -FilePath $Installer -WorkingDirectory $ScriptDir -WindowStyle Hidden -PassThru -Wait
if ($Process.ExitCode -ne 0) {
    Write-Error 'La instalación no se completó. Revisá el mensaje del instalador.'
    exit $Process.ExitCode
}
Write-Host 'Instalación y accesos directos completados.'
