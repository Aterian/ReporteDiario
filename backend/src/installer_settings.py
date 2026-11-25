# [MOD-00] Captura y restauración de accesos y preferencias de inicio
import base64
import json
import hashlib
import shutil
import subprocess
from pathlib import Path

from deployment import ErrorPaquete, contenido_seguro, guardar_json

SCRIPT = r"""
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$p = [Console]::In.ReadToEnd() | ConvertFrom-Json
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder('\')
$name = 'CheckDiarioIngeap-' + $identity.User.Value
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$config = Join-Path $p.raiz 'inicio_automatico.json'
$paths = @{
  Desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Check Diario - Ingeap.lnk'
  Programs = Join-Path ([Environment]::GetFolderPath('Programs')) 'Check Diario - Ingeap.lnk'
  Startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Check Diario - Ingeap.lnk'
}
if ($p.accion -eq 'capturar') {
  $task = $null; $value = $null
  try { $task = $folder.GetTask($name).Xml } catch {}
  try { $value = Get-ItemPropertyValue -LiteralPath $run -Name CheckDiarioIngeap } catch {}
  $files = @{}
  foreach ($key in $paths.Keys) {
    $files[$key] = if (Test-Path -LiteralPath $paths[$key]) { [Convert]::ToBase64String([IO.File]::ReadAllBytes($paths[$key])) } else { $null }
  }
  $configBytes = if (Test-Path -LiteralPath $config) { [Convert]::ToBase64String([IO.File]::ReadAllBytes($config)) } else { $null }
  @{sid=$identity.User.Value; task=$task; run=$value; files=$files; config=$configBytes} | ConvertTo-Json -Depth 5 -Compress
} elseif ($p.accion -eq 'restaurar') {
  $old = $p.anterior
  if ($old.sid -ne $identity.User.Value) { throw 'La copia de configuración corresponde a otro usuario.' }
  if ($old.task) { $null = $folder.RegisterTask($name, $old.task, 6, $identity.User.Value, $null, 3) }
  else { try { $folder.DeleteTask($name, 0) } catch {} }
  if ($null -ne $old.run) { New-Item -Path $run -Force | Out-Null; Set-ItemProperty -LiteralPath $run -Name CheckDiarioIngeap -Value $old.run }
  else { Remove-ItemProperty -LiteralPath $run -Name CheckDiarioIngeap -ErrorAction SilentlyContinue }
  foreach ($key in $paths.Keys) {
    $bytes = $old.files.$key
    if ($null -ne $bytes) { [IO.File]::WriteAllBytes($paths[$key], [Convert]::FromBase64String($bytes)) }
    elseif (Test-Path -LiteralPath $paths[$key]) { Remove-Item -LiteralPath $paths[$key] -Force }
  }
  if ($null -ne $old.config) { [IO.File]::WriteAllBytes($config, [Convert]::FromBase64String($old.config)) }
  elseif (Test-Path -LiteralPath $config) { Remove-Item -LiteralPath $config -Force }
  '{"exito":true}'
} elseif ($p.accion -eq 'accesos') {
  $shell = New-Object -ComObject WScript.Shell
  foreach ($key in @('Desktop','Programs')) {
    $s = $shell.CreateShortcut($paths[$key])
    $s.TargetPath = $p.ejecutable
    $s.WorkingDirectory = $p.raiz
    $s.IconLocation = $p.ejecutable + ',0'
    $s.Description = 'Check Diario - Ingeap'
    $s.Save()
  }
  '{"exito":true}'
}
"""


def ejecutar(accion, raiz, **datos):
    comando = base64.b64encode(SCRIPT.encode("utf-16-le")).decode("ascii")
    resultado = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", comando],
        input=json.dumps({"accion": accion, "raiz": str(raiz), **datos}),
        shell=False,
        capture_output=True, text=True, encoding="utf-8", errors="strict",
        timeout=30, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if resultado.returncode:
        raise ErrorPaquete("Windows no permitió actualizar los accesos o conservar las preferencias.")
    return json.loads(resultado.stdout.lstrip("\ufeff"))


def capturar(raiz, transaccion):
    raiz = Path(raiz).resolve()
    archivo = contenido_seguro(raiz, raiz / "updates" / ("settings-" + transaccion + ".json"))
    datos = ejecutar("capturar", raiz)
    desinstalador = contenido_seguro(raiz, raiz / "Desinstalar.ps1")
    datos["uninstaller"] = base64.b64encode(desinstalador.read_bytes()).decode("ascii") if desinstalador.is_file() else None
    legacy = contenido_seguro(raiz, raiz / "CheckDiarioIngeap.exe")
    datos["legacy_exe"] = legacy.exists()
    if legacy.exists():
        backup = contenido_seguro(raiz, raiz / "updates" / ("legacy-" + transaccion + ".exe"))
        shutil.copy2(legacy, backup)
        datos["legacy_hash"] = hashlib.sha256(backup.read_bytes()).hexdigest()
    guardar_json(archivo, datos)


def restaurar(raiz, transaccion):
    raiz = Path(raiz).resolve()
    archivo = contenido_seguro(raiz, raiz / "updates" / ("settings-" + transaccion + ".json"))
    if archivo.exists():
        datos = json.loads(archivo.read_text(encoding="utf-8"))
        desinstalador = contenido_seguro(raiz, raiz / "Desinstalar.ps1")
        if datos.get("uninstaller") is not None:
            desinstalador.write_bytes(base64.b64decode(datos["uninstaller"]))
        elif desinstalador.is_file() and datos.get("uninstaller_hash"):
            if hashlib.sha256(desinstalador.read_bytes()).hexdigest() == datos["uninstaller_hash"]:
                desinstalador.unlink()
        legacy = contenido_seguro(raiz, raiz / "CheckDiarioIngeap.exe")
        backup = contenido_seguro(raiz, raiz / "updates" / ("legacy-" + transaccion + ".exe"))
        if datos.get("legacy_exe") and backup.exists():
            if hashlib.sha256(backup.read_bytes()).hexdigest() != datos.get("legacy_hash"):
                raise ErrorPaquete("La copia del ejecutable anterior está dañada. Se conservaron los archivos de recuperación.")
            shutil.copy2(backup, legacy)
        elif not datos.get("legacy_exe") and legacy.is_file() and datos.get("launcher_hash"):
            if hashlib.sha256(legacy.read_bytes()).hexdigest() == datos["launcher_hash"]:
                legacy.unlink()
        ejecutar("restaurar", raiz, anterior=datos)


def configurar(raiz, ejecutable, *, primera_instalacion=False, launcher=None, transaccion=None, desinstalador=None):
    from startup_manager import configurar_inicio
    resultado = configurar_inicio(ejecutable, primera_instalacion=primera_instalacion, directorio=raiz)
    if not resultado["exito"]:
        raise ErrorPaquete(resultado["error"])
    ejecutar("accesos", raiz, ejecutable=str(ejecutable))
    if launcher is not None and transaccion is not None:
        raiz = Path(raiz).resolve()
        snapshot = contenido_seguro(raiz, raiz / "updates" / ("settings-" + transaccion + ".json"))
        datos = json.loads(snapshot.read_text(encoding="utf-8"))
        datos["launcher_hash"] = hashlib.sha256(Path(launcher).read_bytes()).hexdigest()
        guardar_json(snapshot, datos)
        temporal = contenido_seguro(raiz, raiz / "updates" / ("launcher-" + transaccion + ".exe"))
        shutil.copy2(launcher, temporal)
        temporal.replace(contenido_seguro(raiz, raiz / "CheckDiarioIngeap.exe"))
        if desinstalador is not None:
            datos["uninstaller_hash"] = hashlib.sha256(Path(desinstalador).read_bytes()).hexdigest()
            guardar_json(snapshot, datos)
            temporal = contenido_seguro(raiz, raiz / "updates" / ("uninstall-" + transaccion + ".ps1"))
            shutil.copy2(desinstalador, temporal)
            temporal.replace(contenido_seguro(raiz, raiz / "Desinstalar.ps1"))
