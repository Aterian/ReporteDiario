# -*- mode: python ; coding: utf-8 -*-
import os

base_dir = SPECPATH
a = Analysis([os.path.join(base_dir, "launcher.py")], pathex=[base_dir], binaries=[], datas=[],
             hiddenimports=[], hookspath=[], runtime_hooks=[], excludes=["numpy", "webview", "openpyxl"])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="CheckDiarioLauncher",
          console=False, upx=False, version=os.path.join(base_dir, "file_version_info.txt"),
          icon=os.path.join(base_dir, "assets", "app.ico"))
