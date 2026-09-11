# -*- mode: python ; coding: utf-8 -*-
import os
import sys

block_cipher = None

base_dir = SPECPATH

added_files = [
    (os.path.join(base_dir, "dist"), "dist"),
    (os.path.join(base_dir, "assets"), "assets"),
    (os.path.join(base_dir, "config.json"), "."),
    (os.path.join(base_dir, "app-xrbnwyhr6nmuvnylmuutjr43be-4baae45ec6b2.json"), "."),
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
    "gspread",
    "google.auth",
    "google.oauth2.service_account",
    "sqlite3",
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
    icon=os.path.join(base_dir, "assets", "app.ico"),
)
