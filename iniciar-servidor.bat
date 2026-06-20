@echo off
chcp 65001 >nul
title MonsterChat - Servidor local (teste IA Fase 1 e 2)
cd /d "%~dp0"

echo =====================================================
echo  MonsterChat - servidor local
echo.
echo  Chat / Sugestao da IA : http://localhost:3000
echo  API (webhooks/envio)  : http://localhost:3001
echo =====================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] npm nao encontrado no PATH.
  echo Instale o Node.js 20+ ^(https://nodejs.org^) e tente de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Primeira execucao: instalando dependencias ^(pode demorar^)...
  call npm install
  echo.
)

echo Abrindo o navegador em alguns segundos...
start "" /min cmd /c "timeout /t 14 >nul & start http://localhost:3000"

echo Iniciando o servidor. Deixe esta janela aberta.
echo Para PARAR: pressione Ctrl+C nesta janela.
echo.
call npm run dev

echo.
echo O servidor foi encerrado.
pause
