@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo =====================================================
echo       ARGOS - MONITOR AO VIVO - VERSAO 1.1
echo =====================================================
echo.
if not exist "..\ml\.venv\Scripts\python.exe" (
  echo ERRO: Nao encontrei o Python em ..\ml\.venv\Scripts\python.exe
  echo.
  echo A pasta monitor-demo deve estar na raiz do repositorio Argos,
  echo ao lado de ml. Consulte o README.md.
  echo.
  pause
  exit /b 1
)
set "ARGOS_MONITOR_AUTO_OPEN=1"
"..\ml\.venv\Scripts\python.exe" servidor.py
if errorlevel 1 (
  echo.
  echo O monitor encerrou com erro. Veja a mensagem acima.
  pause
)
