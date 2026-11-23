param([string]$Zig = "$PSScriptRoot/../.tools/ziglang/ziglang/zig.exe")
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    if (!(Test-Path -LiteralPath $Zig)) { throw 'Instale: python -m pip install --target .tools/ziglang ziglang==0.13.0' }
    New-Item -ItemType Directory -Force .build | Out-Null
    & $Zig c++ -std=c++17 -Itests/host -Ifirmware/libraries/ArgosProtocol/src tests/host/protocol_test.cpp -lbcrypt -o .build/protocol_test.exe
    if ($LASTEXITCODE -ne 0) { throw 'Compilação do teste falhou' }
    $result = & ./.build/protocol_test.exe
    if ($LASTEXITCODE -ne 0) { throw 'Teste nativo falhou' }
    $expected = python -c "import struct,uuid,hmac; p=struct.pack('<IBBH16sQI',0xa260bee1,2,255,0,uuid.UUID('12345678-1234-4234-9234-123456789abc').bytes,0x0123456789abcdef,42); print((p+hmac.digest(b'0123456789abcdef0123456789abcdef',p,'sha256')[:16]).hex())"
    if ($LASTEXITCODE -ne 0 -or $result[0] -ne $expected) { throw 'Wire/HMAC diverge do vetor Python' }
    $result
    'OK: wire de 52 bytes idêntico ao vetor independente Python'
    & $Zig c++ -std=c++17 -Itests/host -Ifirmware/libraries/ArgosProtocol/src -Ifirmware/ArgosReceptor tests/host/queue_test.cpp -lbcrypt -o .build/queue_test.exe
    if ($LASTEXITCODE -ne 0) { throw 'Compilação do teste de fila falhou' }
    & ./.build/queue_test.exe
    if ($LASTEXITCODE -ne 0) { throw 'Teste de fila falhou' }
    & $Zig c++ -std=c++17 firmware/tests/time_recovery.cpp -o .build/time_recovery.exe
    if ($LASTEXITCODE -ne 0) { throw 'Compilação de recuperação de horário falhou' }
    & ./.build/time_recovery.exe
    if ($LASTEXITCODE -ne 0) { throw 'Teste de recuperação de horário falhou' }
    'OK: recuperação NTP limitada ao mesmo boot e janela de cinco minutos'
} finally { Pop-Location }
