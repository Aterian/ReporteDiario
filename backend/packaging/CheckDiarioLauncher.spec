# -*- mode: python ; coding: utf-8 -*-
import os

base_dir = os.path.dirname(SPECPATH)
src_dir = os.path.join(base_dir, "src")
version_file = os.environ.get("CHECK_DIARIO_VERSION_FILE", os.path.join(SPECPATH, "file_version_info.txt"))

a = Analysis([os.path.join(src_dir, "launcher.py")], pathex=[src_dir, base_dir], binaries=[], datas=[],
             hiddenimports=[], hookspath=[], runtime_hooks=[], excludes=["numpy", "webview", "openpyxl"])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="CheckDiarioLauncher",
          console=False, upx=False, version=version_file,
          icon=os.path.join(base_dir, "assets", "app.ico"))
