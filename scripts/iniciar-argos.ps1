<#
.SYNOPSIS
  Sobe o Argos no notebook gateway: EMQX, worker MQTT, API, frontend e worker Python, cada um numa janela.

.DESCRIPTION
  Ordem: broker primeiro, depois o worker MQTT (sessão persistente que guarda as leituras QoS 1),
  depois API e telas. Fechar uma janela encerra só aquele processo. Para tudo: feche as janelas e,
  se quiser parar o broker, docker stop argos-emqx.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\iniciar-argos.ps1
  powershell -ExecutionPolicy Bypass -File scripts\iniciar-argos.ps1 -SemPython -SemFrontend
#>
param([switch]$SemPython, [switch]$SemFrontend)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

function Abrir([string]$titulo, [string]$comando) {
  $script = "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$raiz'; $comando"
  Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $script | Out-Null
  Write-Host "  janela aberta: $titulo"
}

Write-Host '== Broker EMQX' -ForegroundColor Cyan
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker não encontrado: abra o Docker Desktop.' }
$ErrorActionPreference = 'Continue'
$existe = docker ps -a --filter 'name=^argos-emqx$' --format '{{.Names}}' 2>$null
if ($existe) { docker start argos-emqx | Out-Null } else { docker compose -f (Join-Path $raiz 'docker-compose.yml') up -d emqx }
$ErrorActionPreference = 'Stop'
$pronto = $false
foreach ($i in 1..30) {
  if (Test-NetConnection -ComputerName 127.0.0.1 -Port 1883 -InformationLevel Quiet -WarningAction SilentlyContinue) { $pronto = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $pronto) { throw 'EMQX não abriu a porta 1883 em 60 s. Veja: docker logs argos-emqx' }
Write-Host '  EMQX aceitando conexões na porta 1883'

Write-Host '== Processos' -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $raiz 'backend\.env'))) { throw 'backend\.env não encontrado (veja backend/README.md).' }
Abrir 'Argos - worker MQTT' 'pnpm --dir backend mqtt:worker'
Start-Sleep -Seconds 3   # sessão do worker antes dos receptores despejarem a fila
Abrir 'Argos - API' 'pnpm --dir backend dev'
if (-not $SemFrontend) { Abrir 'Argos - frontend' 'pnpm --dir frontend dev' }
if (-not $SemPython) {
  if ((Test-Path (Join-Path $raiz 'iot\.venv\Scripts\python.exe')) -and (Test-Path (Join-Path $raiz 'iot\.env'))) {
    Abrir 'Argos - worker Python' 'Set-Location iot; .\.venv\Scripts\python.exe -m argos_iot.worker'
  } else {
    Write-Host '  worker Python não configurado: rode scripts\configurar-worker-python.ps1 (o mapa fica sem posição)' -ForegroundColor Yellow
  }
}
Write-Host "`nTelas: http://localhost:5173  |  Painel EMQX: http://localhost:18083"
