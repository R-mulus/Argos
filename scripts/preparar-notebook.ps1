#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Prepara o notebook gateway do Argos para o ensaio com ESP32 (docs/iot/ENSAIO.md).

.DESCRIPTION
  - Libera no firewall MQTT (TCP 1883) e NTP (UDP 123) somente para a rede local.
  - Ativa o servidor NTP do Windows, para os receptores terem horario sem internet.
  - Mostra o IP do notebook, a rede Wi-Fi atual e as redes 2,4 GHz proximas com o canal.
  - Confere se o EMQX esta rodando e aceitando conexoes na porta 1883.
  Nao altera o repositorio nem o Supabase.

.EXAMPLE
  # PowerShell como administrador, na raiz do repositorio:
  powershell -ExecutionPolicy Bypass -File scripts\preparar-notebook.ps1

.EXAMPLE
  # Depois da apresentacao: remove as regras e desativa o servidor NTP.
  powershell -ExecutionPolicy Bypass -File scripts\preparar-notebook.ps1 -Desfazer
#>
param([switch]$Desfazer)

$ErrorActionPreference = 'Stop'
$regras = @(
  @{ Nome = 'Argos MQTT 1883'; Protocolo = 'TCP'; Porta = 1883 },
  @{ Nome = 'Argos NTP 123'; Protocolo = 'UDP'; Porta = 123 }
)
$chaveNtp = 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders\NtpServer'
$chaveConfig = 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Config'

function Titulo([string]$texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Ok([string]$texto) { Write-Host "  [ok] $texto" -ForegroundColor Green }
function Aviso([string]$texto) { Write-Host "  [atenção] $texto" -ForegroundColor Yellow }

if ($Desfazer) {
  foreach ($r in $regras) {
    Get-NetFirewallRule -DisplayName $r.Nome -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  }
  Set-ItemProperty -Path $chaveNtp -Name Enabled -Value 0
  Restart-Service w32time
  Write-Host 'Regras de firewall do Argos removidas e servidor NTP do Windows desativado.'
  return
}

Titulo 'Firewall (somente rede local)'
foreach ($r in $regras) {
  if (Get-NetFirewallRule -DisplayName $r.Nome -ErrorAction SilentlyContinue) {
    Ok "regra '$($r.Nome)' já existe"
  } else {
    New-NetFirewallRule -DisplayName $r.Nome -Direction Inbound -Protocol $r.Protocolo `
      -LocalPort $r.Porta -RemoteAddress LocalSubnet -Action Allow | Out-Null
    Ok "regra '$($r.Nome)' criada"
  }
}

Titulo 'Servidor NTP do Windows'
Set-ItemProperty -Path $chaveNtp -Name Enabled -Value 1
Set-ItemProperty -Path $chaveConfig -Name AnnounceFlags -Value 5
Set-Service w32time -StartupType Automatic
Restart-Service w32time
w32tm /config /update | Out-Null
if ((Get-ItemProperty -Path $chaveNtp).Enabled -eq 1 -and (Get-Service w32time).Status -eq 'Running') {
  Ok 'servidor NTP ativo (UDP 123)'
} else {
  Aviso 'servidor NTP não ficou ativo; confira com: w32tm /query /configuration'
}
$utc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')
Write-Host "  Hora do notebook: $utc UTC. Confira com o celular: os receptores herdam esta hora."

Titulo 'Endereços IPv4 do notebook'
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|Loopback' -and $_.IPAddress -notlike '169.254*' } |
  ForEach-Object { Write-Host ("  {0,-28} {1}" -f $_.InterfaceAlias, $_.IPAddress) }
Write-Host '  Use em ARGOS_MQTT_HOST o IP do adaptador ligado à mesma rede dos receptores'
Write-Host '  (ou "gateway" se o notebook for o hotspot). Ignore vEthernet/WSL.'

Titulo 'Wi-Fi atual'
$interfaces = netsh wlan show interfaces
$interfaces | Select-String -Pattern '^\s*(SSID|Banda|Band|Canal|Channel)\s*:' | ForEach-Object { Write-Host "  $($_.Line.Trim())" }
$canalAtual = $interfaces | Select-String -Pattern '^\s*(Canal|Channel)\s*:\s*(\d+)' | Select-Object -First 1
if ($canalAtual -and [int]$canalAtual.Matches[0].Groups[2].Value -gt 14) {
  Aviso 'o notebook está numa rede 5 GHz. Os ESP32 só enxergam redes 2,4 GHz (canal 1 a 13).'
}

Titulo 'Redes 2,4 GHz próximas (as que o ESP32 consegue usar)'
$saida = netsh wlan show networks mode=bssid
$ssid = $null; $redes = @()
foreach ($linha in $saida) {
  if ($linha -match '^SSID \d+\s*:\s*(.*)$') { $ssid = $Matches[1].Trim(); if (-not $ssid) { $ssid = '(oculta)' } }
  elseif ($linha -match '^\s*(Canal|Channel)\s*:\s*(\d+)') {
    $canal = [int]$Matches[2]
    if ($canal -le 14) { $redes += [pscustomobject]@{ SSID = $ssid; Canal = $canal } }
  }
}
if ($redes.Count -gt 0) {
  $redes | Sort-Object SSID, Canal -Unique | Format-Table -AutoSize | Out-String | Write-Host
  Write-Host '  Escolha uma rede com canal FIXO no roteador e use esse número em ARGOS_WIFI_CHANNEL'
  Write-Host '  (receptores e coleiras). Canal automático pode mudar durante a apresentação.'
} else {
  Aviso 'nenhuma rede 2,4 GHz listada. Se o Windows pedir permissão de localização para listar redes,'
  Aviso 'ative em Configurações > Privacidade > Localização e rode de novo. Saída original:'
  $saida | Select-Object -First 8 | ForEach-Object { Write-Host "    $_" }
}

Titulo 'Broker EMQX'
if (Get-Command docker -ErrorAction SilentlyContinue) {
  $ErrorActionPreference = 'Continue'   # docker escreve avisos no stderr
  $emqx = docker ps --filter 'name=^argos-emqx$' --format '{{.Status}}' 2>$null
  $ErrorActionPreference = 'Stop'
  if ($emqx) { Ok "argos-emqx: $emqx" } else { Aviso 'argos-emqx não está rodando: docker compose up -d emqx (ou scripts\iniciar-argos.ps1)' }
} else {
  Aviso 'Docker não encontrado no PATH (abra o Docker Desktop).'
}
if (Test-NetConnection -ComputerName 127.0.0.1 -Port 1883 -InformationLevel Quiet -WarningAction SilentlyContinue) {
  Ok 'porta 1883 aceitando conexões no notebook'
} else {
  Aviso 'porta 1883 fechada: o broker ainda não subiu'
}
Write-Host "`nPainel do EMQX: http://localhost:18083 (usuários/ACL por receptor e Deny Action = disconnect)."
