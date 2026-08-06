@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Enviar JuridicoBRM para o Git

cd /d "%~dp0"

echo.
echo Pasta do projeto:
cd

where git >nul 2>&1
if errorlevel 1 (
    echo.
    echo ********************************
    echo ERRO: Git nao encontrado.
    echo ********************************
    pause
    exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo.
    echo ********************************
    echo ERRO: esta pasta nao e um repositorio Git.
    echo ********************************
    pause
    exit /b 1
)

echo.
echo === Alteracoes locais ===
git status --short

set "HAS_CHANGES="
for /f "delims=" %%i in ('git status --porcelain') do set "HAS_CHANGES=1"

if not defined HAS_CHANGES (
    echo.
    echo Nao ha arquivos novos para criar commit.
    echo Verificando se existem commits pendentes para enviar...
    goto enviar
)

set "COMMIT_MSG=%~1"
if not defined COMMIT_MSG set /p "COMMIT_MSG=Mensagem do commit: "

if not defined COMMIT_MSG (
    echo.
    echo Operacao cancelada: informe uma mensagem para o commit.
    pause
    exit /b 1
)

echo.
echo === Preparando arquivos ===
git add .
if errorlevel 1 (
    echo.
    echo ********************************
    echo Erro ao preparar os arquivos.
    echo ********************************
    pause
    exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
    echo.
    echo Nao ha alteracoes validas para criar um commit.
    goto enviar
)

echo.
echo === Criando commit ===
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo.
    echo ********************************
    echo Erro ao criar o commit.
    echo ********************************
    pause
    exit /b 1
)

:enviar
echo.
echo === Enviando para o GitHub ===
git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >nul 2>&1
if errorlevel 1 (
    git push -u origin HEAD
) else (
    git push
)

if errorlevel 1 (
    echo.
    echo ********************************
    echo O commit foi criado, mas ocorreu um erro ao enviar para o GitHub.
    echo Rode este BAT novamente depois de corrigir a conexao ou o acesso.
    echo ********************************
    pause
    exit /b 1
)

echo.
echo ====================================
echo Git atualizado e enviado com sucesso!
echo ====================================
pause
