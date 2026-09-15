@echo off
setlocal
title Compilador del Instalador - Check Diario Ingeap

echo ============================================================
echo   Compilacion de Check Diario - Ingeap
echo ============================================================
echo.

set "ROOT_DIR=%~dp0"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "INSTALADOR_DIR=%ROOT_DIR%instalador"

echo [1/3] Compilando Frontend (Vite)...
cd /d "%FRONTEND_DIR%"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Fallo la compilacion del Frontend.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Empaquetando Aplicacion con PyInstaller...
cd /d "%BACKEND_DIR%"
call .\venv\Scripts\activate.bat
call pyinstaller --clean --distpath "%INSTALADOR_DIR%" CheckDiarioIngeap.spec
if %errorlevel% neq 0 (
    echo [ERROR] Fallo el empaquetado de PyInstaller.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Verificando instalador generado...
if exist "%INSTALADOR_DIR%\CheckDiarioIngeap.exe" (
    echo.
    echo ============================================================
    echo   Compilacion finalizada exitosamente!
    echo   Ejecutable: instalador\CheckDiarioIngeap.exe
    echo ============================================================
) else (
    echo [ERROR] No se encontro CheckDiarioIngeap.exe en la carpeta instalador.
)

echo.
pause
