# -*- mode: python ; coding: utf-8 -*-
import os
import sys

block_cipher = None

base_dir = SPECPATH

added_files = [
    (os.path.join(base_dir, "dist"), "dist"),
    (os.path.join(base_dir, "assets"), "assets"),
]

hidden_imports = [
    "clr",
    "pythonnet",
    "webview",
    "webview.platforms.winforms",
    "webview.platforms.edgechromium",
    "pystray",
    "pystray._win32",
    "PIL",
    "PIL.Image",
    "PIL.ImageDraw",
    "openpyxl",
    "openpyxl.styles",
    "openpyxl.utils",
    "openpyxl.worksheet",
    "loguru",
    "pydantic",
    "psycopg2",
    "psycopg2.extras",
    "psycopg2.pool",
    "dotenv",
]

a = Analysis(
    [os.path.join(base_dir, 'main.py')],
    pathex=[base_dir],
    binaries=[],
    datas=added_files,
    hiddenimports=hidden_imports,
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
    name='CheckDiarioIngeap',
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
    version=os.path.join(base_dir, "file_version_info.txt"),
    icon=os.path.join(base_dir, "assets", "app.ico"),
)
