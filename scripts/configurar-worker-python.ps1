<#
.SYNOPSIS
  Configura o worker Python do Argos (posição RSSI no mapa): iot/.env, ambiente virtual e teste de conexão.

.DESCRIPTION
  Pede a connection string do PostgreSQL do Supabase sem exibi-la, grava iot/.env (ignorado pelo Git),
  cria iot/.venv com Python 3.12 ou 3.11, instala iot/requirements.txt e consulta argos_iot_jobs.
  Não precisa de administrador. Não instala TensorFlow (não há modelo GRU treinado).

  Onde obter a string: Supabase > projeto Argos > botão "Connect" > "Session pooler" (funciona em
  redes só IPv4). A "Direct connection" (db.pqmdqtcjemgnjtugtuqy.supabase.co) exige IPv6.
  Troque [YOUR-PASSWORD] pela senha do banco (Project Settings > Database > Reset password, se ninguém
  souber). Caracteres especiais da senha precisam estar codificados (@ = %40, # = %23, / = %2F).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\configurar-worker-python.ps1
  powershell -ExecutionPolicy Bypass -File scripts\configurar-worker-python.ps1 -Reconfigurar
#>
param([switch]$Reconfigurar)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$iot = Join-Path $raiz 'iot'
$arquivoEnv = Join-Path $iot '.env'
$venvPython = Join-Path $iot '.venv\Scripts\python.exe'

function Titulo([string]$texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }

Titulo 'iot/.env'
if ((Test-Path $arquivoEnv) -and -not $Reconfigurar) {
  Write-Host '  iot/.env já existe (use -Reconfigurar para trocar a connection string).'
} else {
  Write-Host '  Cole a connection string do Supabase (Connect > Session pooler), já com a senha.'
  $segura = Read-Host '  DATABASE_URL' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
  try { $url = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($url -like 'postgres://*') { $url = 'postgresql://' + $url.Substring('postgres://'.Length) }
  if ($url -notlike 'postgresql://*') { throw 'A string precisa começar com postgresql:// (não use a URL https do Supabase).' }
  if ($url -match '\[YOUR-PASSWORD\]') { throw 'Substitua [YOUR-PASSWORD] pela senha do banco.' }
  if ($url -notmatch 'sslmode=') { $url += $(if ($url.Contains('?')) { '&' } else { '?' }) + 'sslmode=require' }
  $conteudo = @(
    '# Processo interno: nunca fornecer esta credencial ao ESP32/frontend. Arquivo fora do Git.',
    "DATABASE_URL=$url",
    'ARGOS_MODEL_DIR=',
    'ARGOS_POLL_SECONDS=2'
  ) -join "`n"
  [IO.File]::WriteAllText($arquivoEnv, $conteudo + "`n", (New-Object Text.UTF8Encoding $false))
  Write-Host '  iot/.env gravado.'
}

Titulo 'Python e ambiente virtual'
if (-not (Test-Path $venvPython)) {
  $criado = $false
  foreach ($versao in @('3.12', '3.11')) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
      $ErrorActionPreference = 'Continue'   # versão ausente escreve no stderr; não é fatal aqui
      & py "-$versao" -m venv (Join-Path $iot '.venv') 2>$null
      $codigo = $LASTEXITCODE
      $ErrorActionPreference = 'Stop'
      if ($codigo -eq 0) { $criado = $true; Write-Host "  .venv criado com Python $versao"; break }
    }
  }
  if (-not $criado) {
    throw 'Python 3.12 ou 3.11 não encontrado. Instale em python.org (marque "Add to PATH") e rode de novo.'
  }
}
& $venvPython -m pip install --quiet --disable-pip-version-check -r (Join-Path $iot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar iot/requirements.txt' }
Write-Host '  Dependências instaladas.'

Titulo 'Teste de conexão (somente leitura)'
$teste = @'
import os, sys
from dotenv import load_dotenv
import psycopg
load_dotenv()
try:
    with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=10) as conn:
        rows = conn.execute("select estado, count(*) from public.argos_iot_jobs group by estado order by 1").fetchall()
        coords = conn.execute("select count(*) from public.argos_posicoes_receptores").fetchone()[0]
except Exception as erro:
    # Mostra só o tipo e a mensagem do driver, nunca a connection string.
    print("  Falha:", type(erro).__name__, str(erro).splitlines()[0] if str(erro) else "")
    sys.exit(1)
print("  Conectado. Jobs:", ", ".join(f"{e}={n}" for e, n in rows) or "nenhum")
print("  Receptores com coordenadas:", coords)
'@
# Arquivo temporário: o PowerShell 5.1 remove aspas de argumentos passados a programas externos.
$arquivoTeste = Join-Path $env:TEMP 'argos_teste_conexao.py'
[IO.File]::WriteAllText($arquivoTeste, $teste, (New-Object Text.UTF8Encoding $false))
Push-Location $iot
try {
  & $venvPython $arquivoTeste
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  Dica: "could not translate host name"/"Network is unreachable" = use a string do Session pooler;' -ForegroundColor Yellow
    Write-Host '  "password authentication failed" = senha errada ou com caractere especial sem codificar.' -ForegroundColor Yellow
    exit 1
  }
} finally { Pop-Location; Remove-Item $arquivoTeste -ErrorAction SilentlyContinue }
Write-Host "`nPronto. Para rodar: scripts\iniciar-argos.ps1 (ou: cd iot; .\.venv\Scripts\python.exe -m argos_iot.worker)."
