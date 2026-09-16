# -*- mode: python ; coding: utf-8 -*-
import os
import sys

block_cipher = None
base_dir = SPECPATH

added_files = [
    (os.path.join(base_dir, "..", "instalador", "CheckDiarioIngeap.exe"), "."),
]

a = Analysis(
    [os.path.join(base_dir, 'installer_app.py')],
    pathex=[base_dir],
    binaries=[],
    datas=added_files,
    hiddenimports=[],
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
    name='Instalador_CheckDiario_Ingeap',
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
    icon=os.path.join(base_dir, "assets", "app.ico"),
)
