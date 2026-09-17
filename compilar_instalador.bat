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

echo [1/4] Compilando Frontend (Vite)...
cd /d "%FRONTEND_DIR%"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Fallo la compilacion del Frontend.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/4] Empaquetando Aplicacion con PyInstaller...
cd /d "%BACKEND_DIR%"
call .\venv\Scripts\activate.bat
call pyinstaller --clean --distpath "%INSTALADOR_DIR%" CheckDiarioIngeap.spec
if %errorlevel% neq 0 (
    echo [ERROR] Fallo el empaquetado de PyInstaller (CheckDiarioIngeap).
    pause
    exit /b %errorlevel%
)

echo.
echo [3/4] Empaquetando Instalador Autonomo de Archivo Unico...
call pyinstaller --clean --distpath "%INSTALADOR_DIR%" Instalador_CheckDiario_Ingeap.spec
if %errorlevel% neq 0 (
    echo [ERROR] Fallo el empaquetado de PyInstaller (Instalador_CheckDiario_Ingeap).
    pause
    exit /b %errorlevel%
)

echo.
echo [4/4] Verificando ejecutables generados...
if exist "%INSTALADOR_DIR%\Instalador_CheckDiario_Ingeap.exe" (
    echo.
    echo ============================================================
    echo   Compilacion finalizada exitosamente!
    echo   Ejecutable App:        instalador\CheckDiarioIngeap.exe
    echo   Instalador Autonomo:   instalador\Instalador_CheckDiario_Ingeap.exe
    echo ============================================================
) else (
    echo [ERROR] No se encontro el instalador generado en la carpeta instalador.
)

echo.
pause
