# [FN-00.03] Instalador del Candado de Git Pre-Commit para Windows
# Configura el Git Hook en .git/hooks/pre-commit para forzar la ejecución de pytest y vitest antes de cada commit.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Instalador de Candado Git Pre-Commit (Reporte Diario)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$repoRoot = $PSScriptRoot
$gitDir = Join-Path $repoRoot ".git"
$hooksDir = Join-Path $gitDir "hooks"
$preCommitPath = Join-Path $hooksDir "pre-commit"

if (-not (Test-Path $gitDir)) {
    Write-Error "No se encontró el directorio .git en '$repoRoot'. Asegúrate de ejecutar este script desde la raíz del repositorio."
    exit 1
}

if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
    Write-Host "[+] Directorio .git/hooks creado." -ForegroundColor Green
}

$hookContent = @'
#!/bin/sh
# [FN-00.03] Candado de Integridad Git Pre-Commit (Full-Stack Pytest + Vitest)
echo ""
echo "=========================================================="
echo " [GIT HOOK] Verificando integridad Full-Stack (Pre-commit)"
echo "=========================================================="
echo ""

# 1. Backend tests con pytest
echo "[1/2] Ejecutando suite de Backend (pytest)..."
if [ -f "backend/venv/Scripts/pytest.exe" ]; then
    ./backend/venv/Scripts/pytest.exe backend/tests/
else
    python -m pytest backend/tests/
fi

PYTEST_EXIT_CODE=$?
if [ $PYTEST_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ ERROR: Fallaron las pruebas de Backend (pytest)."
    echo "El commit ha sido abortado para prevenir regresiones de base de datos o lógica salarial."
    echo ""
    exit $PYTEST_EXIT_CODE
fi

echo "✅ Backend suite: OK"
echo ""

# 2. Frontend tests con vitest
echo "[2/2] Ejecutando suite de Frontend (vitest)..."
cd frontend || exit 1
if command -v npm.cmd >/dev/null 2>&1; then
    npm.cmd run test -- --run
else
    npm run test -- --run
fi

VITEST_EXIT_CODE=$?
cd .. || exit 1

if [ $VITEST_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ ERROR: Fallaron las pruebas de Frontend (vitest)."
    echo "El commit ha sido abortado para prevenir regresiones en la interfaz y permisos."
    echo ""
    exit $VITEST_EXIT_CODE
fi

echo ""
echo "=========================================================="
echo " ✅ Integridad Full-Stack verificada al 100%."
echo " Procediendo con el commit..."
echo "=========================================================="
echo ""
exit 0
'@

# Asegurar terminaciones de línea LF (Unix) para compatibilidad con el bash de Git en Windows
$hookContentLf = $hookContent -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($preCommitPath, $hookContentLf, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "[OK] Hook de pre-commit instalado exitosamente en:" -ForegroundColor Green
Write-Host "     $preCommitPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "El repositorio ahora cuenta con candado activo contra regresiones:" -ForegroundColor Cyan
Write-Host "  1. Backend: backend/venv/Scripts/pytest.exe backend/tests/" -ForegroundColor Gray
Write-Host "  2. Frontend: npm run test -- --run en /frontend" -ForegroundColor Gray
Write-Host ""
Write-Host "Cualquier commit será automáticamente bloqueado si alguna prueba falla." -ForegroundColor Green
Write-Host ""
