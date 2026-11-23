#requires -RunAsAdministrator
param(
    [Parameter(Mandatory = $true)][System.Net.IPAddress]$BrokerAddress,
    [Parameter(Mandatory = $true)][System.Net.IPAddress]$ReceiverAddress,
    [string]$InterfaceAlias = 'Wi-Fi',
    [ValidateRange(1, 65535)][int]$Port = 1883
)
$ErrorActionPreference = 'Stop'
$ruleName = 'Argos-MQTT-ESP32-Diagnostic'
if (-not (Get-NetIPAddress -InterfaceAlias $InterfaceAlias -AddressFamily IPv4 | Where-Object IPAddress -eq $BrokerAddress.IPAddressToString)) {
    throw 'O IP do broker não pertence à interface informada. Confira Get-NetIPAddress.'
}
if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
    throw 'A regra de diagnóstico já existe. Inspecione-a antes de alterar/remover; nenhuma mudança foi feita.'
}
New-NetFirewallRule -Name $ruleName -DisplayName 'Argos MQTT - ESP32 de diagnóstico' `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
    -LocalAddress $BrokerAddress.IPAddressToString -RemoteAddress $ReceiverAddress.IPAddressToString `
    -InterfaceAlias $InterfaceAlias -Profile Public,Private | Select-Object Name,Enabled,Action,Profile
Write-Output 'Regra restrita ao ESP32/IP/interface informados. Não altera o perfil da rede nem desativa o firewall.'
