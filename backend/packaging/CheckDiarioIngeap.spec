# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None

base_dir = os.path.dirname(SPECPATH)
src_dir = os.path.join(base_dir, "src")
edicion = os.environ.get("CHECK_DIARIO_EDITION", "gestion").strip().lower()
version_file = os.environ.get("CHECK_DIARIO_VERSION_FILE", os.path.join(SPECPATH, "file_version_info.txt"))

added_files = [
    (os.path.join(base_dir, "dist"), "dist"),
    (os.path.join(base_dir, "assets"), "assets"),
]

hidden_imports = [
    "_build_edition",
    "update_channels",
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
    "loguru",
    "pydantic",
    "psycopg2",
    "psycopg2.errors",
    "psycopg2.extras",
    "psycopg2.pool",
    "dotenv",
]

excludes = ["numpy", "pandas", "pytest"]

if edicion == "operativa":
    excludes.extend(["openpyxl", "roster_export", "liquidacion_export", "postgres_exports"])
else:
    hidden_imports.extend([
        "openpyxl",
        "openpyxl.styles",
        "openpyxl.utils",
        "openpyxl.worksheet",
    ])

a = Analysis(
    [os.path.join(src_dir, 'main.py')],
    pathex=[src_dir, base_dir],
    binaries=[],
    datas=added_files,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True,
    name='CheckDiarioIngeap', console=False, upx=False,
    contents_directory='_internal',
    version=version_file,
    icon=os.path.join(base_dir, "assets", "app.ico"),
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='app')
