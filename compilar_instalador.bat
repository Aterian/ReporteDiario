@echo off
setlocal
title Compilador Check Diario Ingeap 2.18.0
set "ROOT_DIR=%~dp0"
set "BUILD_PYTHON=%ROOT_DIR%backend\venv\Scripts\python.exe"
set "EDICION=%~1"
if "%EDICION%"=="" set "EDICION=ambas"
if not exist "%BUILD_PYTHON%" (
    echo Configure backend\venv con requirements-build.lock antes de compilar.
    exit /b 1
)
"%BUILD_PYTHON%" "%ROOT_DIR%backend\build_release.py" --edicion %EDICION% --clean-env
if errorlevel 1 exit /b %errorlevel%
echo Compilacion completa (%EDICION%): artefactos generados en instalador\.
