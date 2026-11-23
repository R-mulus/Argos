#requires -RunAsAdministrator
param([ValidateRange(2, 65534)][int]$Port = 1883)
$ErrorActionPreference = 'Stop'
# Um bloqueio explícito prevalece sobre allow. Mantenha o bloqueio do Docker
# nos demais ports; retire apenas a porta MQTT, que continua sujeita às regras allow.
$allow = Get-NetFirewallRule -Name 'Argos-MQTT-ESP32-Diagnostic' -ErrorAction Stop
if ($allow.Enabled -ne 'True' -or $allow.Action -ne 'Allow') {
    throw 'Crie primeiro a regra restrita com allow-mqtt-esp32.ps1.'
}
$allowPort = $allow | Get-NetFirewallPortFilter
if ($allowPort.Protocol -notin @('TCP', '6') -or $allowPort.LocalPort -ne $Port.ToString()) {
    throw 'A regra de liberação não corresponde à porta TCP solicitada; nenhuma mudança foi feita.'
}
$changed = 0
Get-NetFirewallRule -Enabled True -Direction Inbound -Action Block |
    Where-Object { $_.Profile.ToString() -eq 'Public' } |
    ForEach-Object {
        $rule = $_
        $app = $rule | Get-NetFirewallApplicationFilter
        if ($app.Program -notlike '*\com.docker.backend.exe') { return }
        $filter = $rule | Get-NetFirewallPortFilter
        if ($filter.Protocol -notin @('TCP', '6') -or $filter.LocalPort -ne 'Any') { return }
        $ports = @("1-$($Port - 1)", "$($Port + 1)-65535")
        $filter | Set-NetFirewallPortFilter -LocalPort $ports
        $changed++
        Write-Output "Regra $($rule.Name): bloqueio TCP/Public do Docker preservado em $($ports -join ','); exceção somente para $Port."
        Write-Output "Reverter: Get-NetFirewallRule -Name '$($rule.Name)' | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort Any"
    }
if (-not $changed) { Write-Output 'Nenhum bloqueio TCP/Public/Any do executável Docker encontrado; nenhuma alteração.' }
