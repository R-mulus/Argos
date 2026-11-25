@echo off
chcp 65001 > nul
setlocal
cd /d "%~dp0"

echo.
echo =====================================================
echo      ARGOS - MONITOR AO VIVO - PYTHON 3.14.6
echo =====================================================
echo.

REM Confirma que o Python 3.14.6 exato esta instalado.
py -3.14 -c "import sys; raise SystemExit(0 if sys.version_info[:3] == (3,14,6) else 1)" > nul 2>&1
if errorlevel 1 (
  echo ERRO: Python 3.14.6 nao foi encontrado pelo Python Launcher.
  echo Instale Python 3.14.6 e confirme com: py -0p
  echo.
  pause
  exit /b 1
)

REM Cria um ambiente virtual exclusivo para o monitor, sem alterar ml\.venv.
if not exist ".venv\Scripts\python.exe" (
  echo Criando ambiente virtual do monitor com Python 3.14.6...
  py -3.14 -m venv .venv
  if errorlevel 1 goto :error
)

REM Garante que o ambiente virtual foi criado com a versao exata.
".venv\Scripts\python.exe" -c "import sys; raise SystemExit(0 if sys.version_info[:3] == (3,14,6) else 1)"
if errorlevel 1 (
  echo ERRO: o ambiente .venv nao esta usando Python 3.14.6.
  echo Apague somente a pasta monitor-demo\.venv e execute novamente.
  echo.
  pause
  exit /b 1
)

REM Instala somente as duas dependencias do servidor, se estiverem ausentes.
".venv\Scripts\python.exe" -c "import requests, dotenv" > nul 2>&1
if errorlevel 1 (
  echo Instalando dependencias do monitor...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  if errorlevel 1 goto :error
  ".venv\Scripts\python.exe" -m pip install -r requirements-monitor.txt
  if errorlevel 1 goto :error
)

set "ARGOS_MONITOR_AUTO_OPEN=1"
".venv\Scripts\python.exe" servidor.py
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo O monitor encerrou com erro. Veja a mensagem acima.
echo.
pause
exit /b 1
