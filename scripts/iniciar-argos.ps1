<#
.SYNOPSIS
  Sobe o Argos para a apresentação, cada processo numa janela (roteiro: docs/operacao/APRESENTACAO.md).

.DESCRIPTION
  Lado IoT (notebook com o broker provisionado e as placas gravadas):
    1. EMQX de broker/ (usuários e ACL por dispositivo, Deny Action = disconnect)
    2. worker/      ingestão MQTT -> fila SQLite -> Supabase (único ingestor; NÃO usar backend/src/mqtt)
    3. ml/          trilateração + GRU acadêmica (único processador; NÃO usar iot/)
  Lado da aplicação (qualquer notebook com internet):
    4. API Express (backend/)
    5. Telas (frontend/, Vite)

  Por padrão sobe tudo. Use -SomenteIoT no notebook das placas e -SomenteApp no notebook da tela.
  Fechar uma janela encerra só aquele processo. Nada aqui apaga filas, volumes ou dados.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\iniciar-argos.ps1
  powershell -ExecutionPolicy Bypass -File scripts\iniciar-argos.ps1 -SomenteIoT
  powershell -ExecutionPolicy Bypass -File scripts\iniciar-argos.ps1 -SomenteApp
#>
param([switch]$SomenteIoT, [switch]$SomenteApp, [switch]$SemML)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
if ($SomenteIoT -and $SomenteApp) { throw 'Use -SomenteIoT ou -SomenteApp, não os dois.' }

function Abrir([string]$titulo, [string]$pasta, [string]$comando) {
  $script = "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$pasta'; $comando"
  Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $script | Out-Null
  Write-Host "  janela aberta: $titulo"
}
function Exigir([string]$caminho, [string]$dica) {
  if (-not (Test-Path (Join-Path $raiz $caminho))) { throw "$caminho não encontrado. $dica" }
}

if (-not $SomenteApp) {
  Write-Host '== Lado IoT' -ForegroundColor Cyan
  Exigir 'broker\.env' 'Provisione o broker (broker/README.md).'
  Exigir 'broker\private\users.json' 'Provisione o broker (npm run provision em worker/).'
  Exigir 'worker\.env' 'Copie worker/.env.example e preencha (chave secreta do Supabase).'
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker não encontrado: abra o Docker Desktop.' }
  $versaoNode = [int]((node -v) -replace '^v(\d+).*', '$1')
  if ($versaoNode -lt 24) { throw "O worker exige Node 24 (node:sqlite); encontrado Node $versaoNode." }

  $ErrorActionPreference = 'Continue'
  docker compose --env-file (Join-Path $raiz 'broker\.env') -f (Join-Path $raiz 'broker\docker-compose.yml') up -d --wait
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($codigo -ne 0) { throw 'EMQX não subiu. Veja: docker compose --env-file broker/.env -f broker/docker-compose.yml logs emqx' }
  Write-Host '  EMQX pronto'

  if (-not (Test-Path (Join-Path $raiz 'worker\dist\src\index.js'))) {
    Push-Location (Join-Path $raiz 'worker'); try { npm run build } finally { Pop-Location }
  }
  Abrir 'Argos - worker (ingestão)' (Join-Path $raiz 'worker') 'npm start'
  Start-Sleep -Seconds 3   # sessão MQTT durável antes dos receptores despejarem a fila

  if (-not $SemML) {
    Exigir 'ml\.env' 'Copie ml/.env.example e preencha (docs/operacao/EXECUTAR_MVP.md).'
    Exigir 'ml\.venv\Scripts\python.exe' 'Crie a venv: py -3.12 -m venv ml/.venv; pip install -r ml/requirements-ml.txt'
    Abrir 'Argos - ML (trilateração + GRU)' (Join-Path $raiz 'ml') '.\.venv\Scripts\python.exe -m argos_ml.cli worker'
  }
}

if (-not $SomenteIoT) {
  Write-Host '== Lado da aplicação' -ForegroundColor Cyan
  Exigir 'backend\.env' 'Copie backend/.env.example (URL e chave publishable; nunca a secreta).'
  if (-not ((Test-Path (Join-Path $raiz 'frontend\.env')) -or (Test-Path (Join-Path $raiz 'frontend\.env.local')))) {
    throw 'frontend\.env (ou .env.local) não encontrado. Copie frontend/.env.example (URL e chave publishable).'
  }
  Abrir 'Argos - API' $raiz 'pnpm --dir backend start'
  Abrir 'Argos - telas' $raiz 'pnpm --dir frontend dev'
}

Write-Host "`nNão iniciar backend/src/mqtt (mqtt:worker) nem iot/: um ingestor e um processador por propriedade."
if (-not $SomenteIoT) { Write-Host 'Telas: http://localhost:5173/Argos/' }
if (-not $SomenteApp) { Write-Host 'Painel EMQX (só neste computador): http://localhost:18083' }
