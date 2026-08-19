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

rem O "next build" e o "next dev" escrevem na mesma pasta .next. Se o servidor de
rem desenvolvimento estiver ligado durante a publicacao, os dois se atropelam e o
rem servidor passa a responder erro 500 ate limpar o cache. Por isso o build so
rem comeca depois de encerrar quem estiver ouvindo nas portas de desenvolvimento.
echo.
echo === Encerrando servidores de desenvolvimento ===
powershell -NoProfile -Command "foreach ($porta in 9002,9003) { Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; Write-Host ('  Servidor da porta ' + $porta + ' encerrado.') } }"
echo   (rode iniciar.bat depois, se quiser o servidor de volta)

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