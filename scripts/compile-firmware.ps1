param([string]$ArduinoCli = 'arduino-cli')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    foreach ($board in @('esp32', 'esp32c3', 'esp32s3')) {
        foreach ($sketch in @('ArgosTransmissor', 'ArgosReceptor')) {
            & $ArduinoCli compile --fqbn "esp32:esp32:$board" --libraries firmware/libraries --build-path ".build/$sketch-$board" "firmware/$sketch"
            if ($LASTEXITCODE -ne 0) { throw "Falha: $sketch / $board" }
        }
    }
    & $ArduinoCli compile --fqbn esp32:esp32:esp32 --libraries firmware/libraries --build-path .build/ArgosReceptor-tls --build-property 'compiler.cpp.extra_flags=-DARGOS_LOCAL_PLAINTEXT=0 -DARGOS_MQTT_PORT=8883' firmware/ArgosReceptor
    if ($LASTEXITCODE -ne 0) { throw 'Falha: ArgosReceptor / TLS' }
} finally { Pop-Location }
