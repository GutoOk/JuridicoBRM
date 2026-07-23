@echo off
title Publicar JuridicoBRM

cd /d "%~dp0"

echo.
echo Pasta do projeto:
cd

if not exist "package.json" (
    echo.
    echo ERRO: package.json nao encontrado.
    echo Coloque este arquivo dentro da pasta raiz do App
    pause
    exit /b 1
)

if not exist "firebase.json" (
    echo.
    echo ERRO: firebase.json nao encontrado.
    pause
    exit /b 1
)

echo.
echo === Gerando build ===
call npm run build

if errorlevel 1 (
    echo.
    echo ********************************
    echo Erro ao gerar o build.
    echo ********************************
    pause
    exit /b 1
)

echo.
echo === Publicando no Firebase ===
call firebase deploy

if errorlevel 1 (
    echo.
    echo ********************************
    echo Erro ao publicar no Firebase.
    echo ********************************
    pause
    exit /b 1
)

echo.
echo ====================================
echo Publicacao concluida com sucesso!
echo ====================================
pause