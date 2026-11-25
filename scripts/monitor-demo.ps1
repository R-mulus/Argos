<# Monitor independente e experimento sintético. Executar a partir de qualquer pasta. #>
param(
  [ValidateSet('Instalar','Gerar','Popular','Treinar','Avaliar','Inferir','Monitor','Worker')]
  [string]$Acao = 'Monitor',
  [string]$PythonExe,
  [int]$Epocas = 35
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $raiz 'ml\.venv\Scripts\python.exe'
if ($Acao -eq 'Instalar') {
  if (-not (Test-Path -LiteralPath $venv)) {
    if (-not $PythonExe) { throw 'Informe -PythonExe com o Python compatível instalado. Consulte py -0p; validado neste computador com 3.12.10.' }
    & $PythonExe --version
    & $PythonExe -m venv (Join-Path $raiz 'ml\.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar ambiente virtual.' }
  }
  & $venv -m pip install -r (Join-Path $raiz 'ml\requirements-demo.txt') -r (Join-Path $raiz 'monitor-demo\requirements-monitor.txt')
  exit $LASTEXITCODE
}
if (-not (Test-Path -LiteralPath $venv)) { throw 'Execute -Acao Instalar antes.' }
Push-Location (Join-Path $raiz 'ml')
try {
  switch ($Acao) {
    'Monitor' { & $venv (Join-Path $raiz 'monitor-demo\servidor.py') }
    'Worker' { & $venv -m argos_ml.cli worker }
    'Gerar' { & $venv -m argos_ml.cli demo-v2 generate }
    'Popular' { & $venv -m argos_ml.cli demo-v2 populate }
    'Treinar' { & $venv -m argos_ml.cli demo-v2 train --epochs $Epocas }
    'Avaliar' { & $venv -m argos_ml.cli demo-v2 evaluate }
    'Inferir' { & $venv -m argos_ml.cli demo-v2 infer }
  }
  $codigo = $LASTEXITCODE
} finally { Pop-Location }
exit $codigo
