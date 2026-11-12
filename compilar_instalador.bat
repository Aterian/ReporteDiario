@echo off
setlocal
title Compilador Check Diario Ingeap 2.14.0
set "ROOT_DIR=%~dp0"
set "BUILD_PYTHON=%ROOT_DIR%backend\venv\Scripts\python.exe"
if not exist "%BUILD_PYTHON%" (
    echo Configure backend\venv con requirements-build.lock antes de compilar.
    exit /b 1
)
"%BUILD_PYTHON%" "%ROOT_DIR%backend\build_release.py" --clean-env
if errorlevel 1 exit /b %errorlevel%
echo Compilacion completa: carpeta app, paquete ZIP y migrador compatible en instalador.
