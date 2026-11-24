# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None
base_dir = SPECPATH
release_dir = os.environ.get("CHECK_DIARIO_RELEASE_DIR", os.path.join(base_dir, "..", "instalador"))
version_file = os.environ.get("CHECK_DIARIO_VERSION_FILE", os.path.join(base_dir, "file_version_info.txt"))
installer_name = os.environ.get("CHECK_DIARIO_INSTALLER_NAME", "CheckDiarioIngeap")
zip_source = os.environ.get("CHECK_DIARIO_ZIP_SOURCE", os.path.join(release_dir, "CheckDiarioIngeap-win64.zip"))

added_files = [
    (os.path.join(base_dir, "..", "instalador", "Desinstalar.ps1"), "."),
    (os.path.join(release_dir, "CheckDiarioLauncher.exe"), "."),
    (zip_source, "."),
    (os.path.join(base_dir, ".env"), "."),
]

a = Analysis(
    [os.path.join(base_dir, 'installer_app.py')],
    pathex=[base_dir],
    binaries=[],
    datas=added_files,
    hiddenimports=["_build_edition"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name=installer_name,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version=version_file,
    icon=os.path.join(base_dir, "assets", "app.ico"),
)
