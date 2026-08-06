@echo off
title JuridicoBRM - Servidor Dev

cd /d "%~dp0"

echo.
echo ========================================
echo    Iniciando JuridicoBRM (Porta 9002)
echo ========================================
echo.

if not exist "package.json" (
    echo ERRO: package.json nao encontrado nesta pasta.
    pause
    exit /b 1
)

:: Libera a porta 9002 caso esteja em uso
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9002 ^| findstr LISTENING') do (
    echo Liberando porta 9002 - encerrando processo PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Abrindo o navegador em http://localhost:9002 ...
start http://localhost:9002

echo.
echo Servidor de desenvolvimento rodando...
echo (Mantenha esta janela aberta enquanto usar o sistema)
echo.

call npm run dev

pause
