# [MOD-00] Registro explícito del inicio diferido por usuario
import base64
import json
import subprocess
from pathlib import Path


SCRIPT_INICIO = r"""
$ErrorActionPreference = 'Stop'
$p = [Console]::In.ReadToEnd() | ConvertFrom-Json
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder('\')
$name = 'CheckDiarioIngeap-' + $identity.User.Value
$oldTask = $null
try { $oldTask = $folder.GetTask($name) } catch {}
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$oldRun = $null
try { $oldRun = Get-ItemPropertyValue -LiteralPath $run -Name CheckDiarioIngeap } catch {}
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Check Diario - Ingeap.lnk'
$oldLink = if (Test-Path -LiteralPath $startup) { [IO.File]::ReadAllBytes($startup) } else { $null }
$configPath = Join-Path $p.directorio 'inicio_automatico.json'
$config = $null
try { $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } catch {}
$enabled = [bool]$p.primera_instalacion
if ($oldRun -or $oldLink) {
    $enabled = $true
    foreach ($entry in @(@('Run','CheckDiarioIngeap'), @('StartupFolder','Check Diario - Ingeap.lnk'))) {
        try {
            $data = Get-ItemPropertyValue -LiteralPath ('HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\' + $entry[0]) -Name $entry[1]
            if ($data.Length -lt 1 -or $data[0] -ne 2) { $enabled = $false }
        } catch {
            if ($_.Exception -is [UnauthorizedAccessException] -or $_.Exception -is [Security.SecurityException]) { $enabled = $false }
        }
    }
}
if ($config) { $enabled = [bool]$config.habilitado }
if ($oldTask) { $enabled = [bool]$oldTask.Enabled }
if ($null -ne $p.habilitado) { $enabled = [bool]$p.habilitado }
$oldXml = if ($oldTask) { $oldTask.Xml } else { $null }
$oldConfig = if (Test-Path -LiteralPath $configPath) { [IO.File]::ReadAllBytes($configPath) } else { $null }
$registered = $false
try {
    $definition = $service.NewTask(0)
    $definition.RegistrationInfo.Description = 'Check Diario: inicio liviano con demora'
    $definition.Principal.UserId = $identity.User.Value
    $definition.Principal.LogonType = 3
    $definition.Principal.RunLevel = 0
    $definition.Settings.Enabled = $enabled
    $definition.Settings.DisallowStartIfOnBatteries = $false
    $definition.Settings.StopIfGoingOnBatteries = $false
    $definition.Settings.ExecutionTimeLimit = 'PT0S'
    $definition.Settings.MultipleInstances = 2
    $definition.Settings.StartWhenAvailable = $true
    $trigger = $definition.Triggers.Create(9)
    $trigger.UserId = $identity.User.Value
    $trigger.Delay = 'PT' + $p.demora + 'S'
    $action = $definition.Actions.Create(0)
    $action.Path = $p.ejecutable
    $action.Arguments = '--autostart'
    $action.WorkingDirectory = $p.directorio
    $null = $folder.RegisterTaskDefinition($name, $definition, 6, $identity.User.Value, $null, 3)
    $registered = $true
    $verified = $folder.GetTask($name)
    if ([bool]$verified.Enabled -ne $enabled -or $verified.Definition.Actions.Item(1).Path -ne $p.ejecutable) { throw 'No se pudo verificar el inicio automático.' }
    if ($oldRun) { Remove-ItemProperty -LiteralPath $run -Name CheckDiarioIngeap }
    if ($oldLink) { Remove-Item -LiteralPath $startup -Force }
    $result = @{exito=$true; habilitado=$enabled; demora=[int]$p.demora}
    $result | ConvertTo-Json -Compress | Set-Content -LiteralPath $configPath -Encoding UTF8
    $result | ConvertTo-Json -Compress
} catch {
    if ($registered) {
        if ($oldXml) { $null = $folder.RegisterTask($name, $oldXml, 6, $identity.User.Value, $null, 3) }
        else { $folder.DeleteTask($name, 0) }
        if ($oldRun) { Set-ItemProperty -LiteralPath $run -Name CheckDiarioIngeap -Value $oldRun }
        if ($oldLink) { [IO.File]::WriteAllBytes($startup, $oldLink) }
        if ($oldConfig) { [IO.File]::WriteAllBytes($configPath, $oldConfig) }
        elseif (Test-Path -LiteralPath $configPath) { Remove-Item -LiteralPath $configPath -Force }
    }
    throw
}
"""


def configurar_inicio(ejecutable, *, primera_instalacion=False, habilitado=None, demora=90, directorio=None):
    if not 60 <= demora <= 120:
        raise ValueError("La demora debe estar entre 60 y 120 segundos.")
    exe = Path(ejecutable).resolve()
    payload = {"ejecutable": str(exe), "directorio": str(Path(directorio).resolve() if directorio else exe.parent),
               "primera_instalacion": primera_instalacion, "habilitado": habilitado, "demora": demora}
    command = base64.b64encode(SCRIPT_INICIO.encode("utf-16-le")).decode("ascii")
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", command],
            input=json.dumps(payload), text=True, encoding="utf-8", errors="replace",
            shell=False,
            capture_output=True, timeout=30, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode:
            return {"exito": False, "error": "Windows no permitió configurar el inicio diferido. Se conservó la configuración anterior."}
        return json.loads(result.stdout.strip().lstrip("\ufeff"))
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return {"exito": False, "error": "No se pudo verificar el inicio diferido. Revisá la configuración de inicio en Windows."}
