# Diagnóstico MQTT -2 — 20/11/2026

## Evidências do ambiente

- Branch `backend-iot`. Receptor principal configurado em `192.168.18.14:1883`,
  `ARGOS_LOCAL_PLAINTEXT=1`: usa WiFiClient, sem handshake TLS.
- Docker publica `0.0.0.0:1883`; EMQX inicia listener TCP em `0.0.0.0:1883`.
  Não foi necessário alterar Docker, senhas ou listeners.
- Conexão TCP pelo Windows aprovada em loopback e `192.168.18.14`.
- Autenticação MQTT 3.1.1 pelo IP LAN, usando as credenciais privadas do receptor, aprovada
  a partir do Windows, sem publicar mensagens artificiais. Isso não comprova o trajeto do ESP32.
- Wi-Fi do computador: `192.168.18.14/24`, perfil **Public**, firewall ativo.
  Consulta às regras pelo cmdlet retornou acesso negado. Leitura posterior do registro confirmou
  regra **Block / In / TCP / Public / com.docker.backend.exe**, nome `Docker Desktop Backend`,
  ativa e sem restrição de porta. É uma incompatibilidade concreta com o acesso MQTT nessa rede.
  Há regras allow para 1883, mas bloqueio explícito tem precedência.
- COM10 identificada por esptool como ESP32-S3, flash física de 16 MB. Logs do firmware anterior:
  `WiFi=3 MQTT=0 NTP=0 flash=27 RAM=0 publicadas=0 ...`, com erro `-2`.
- Worker conectado ao broker, sessão durável e uma assinatura. Consulta somente leitura
  com a chave configurada acessou `dispositivos`, `deteccoes` e `vinculos` no Supabase.

O código da biblioteca ArduinoMqttClient 0.1.8 retorna `-2` quando `Client::connect()` falha,
**antes** de enviar MQTT CONNECT. Não é evidência de senha MQTT inválida.
No modo atual significa falha de transporte TCP (ou resolução do host quando for hostname).
No modo seguro também pode indicar falha TLS. `-1` indica espera sem CONNACK; códigos 4/5
indicam recusa de autenticação/autorização de conexão, após estabelecer transporte.

## Alteração mínima no receptor

`ArgosNetworkClient.h` instrumenta a chamada virtual `connect(host, port)` que o próprio MQTT
faz. Não abre socket adicional: o resultado TCP corresponde à mesma tentativa de MQTT.
Em TLS, o resultado inclui TCP + handshake e o detalhe de erro vem do cliente seguro.
`errno_aux` é apenas auxiliar, pois o core pode não preservar o erro original.

Boot passa a mostrar `BUILD: ARGOS-RX-NETDIAG-1`, data/hora de compilação e os valores efetivos
de host, porta, modo, canal e timeout. Em cada conexão há IP local, RSSI Wi-Fi, canal, estado,
tempo da conexão, resultado do transporte/MQTT e tamanho da fila. Mudanças de estado Wi-Fi
registram gateway, máscara e contador de desconexões. Senhas e segredos não são registrados.

Timeout mantido em 2000 ms; reconexão/backoff, callback ESP-NOW, HMAC, QoS 1 e a classe da fila
não foram alterados. `ARGOS_FORMAT_FLASH` continua 0. Para desativar os detalhes depois do ensaio,
configure `ARGOS_NETWORK_DIAGNOSTICS=0`; os logs essenciais e a lógica permanecem.

## Cópia do sketch e canal

Foi encontrada outra cópia em `Argos/firmware/ArgosReceptor`, não rastreada, que não foi alterada.
Abra o sketch principal `firmware/ArgosReceptor/ArgosReceptor.ino` na IDE. O identificador de build
permite detectar uma gravação antiga: o texto NETDIAG não aparece no firmware anterior.

O RX principal estava no canal **2** antes desta tarefa; essa escolha foi preservada.
O arquivo do TX principal e o RX da cópia estavam no canal **6**. Isso é uma divergência comprovada
entre fontes, não comprovação do canal que está gravado no TX físico. Alinhe TX, RX e AP no mesmo
canal fixo antes de regravar o transmissor. Não troque o RX para 6 se o AP continuar no 2.

## Windows: regra restrita para o teste

Em PowerShell **como administrador**, na raiz do repositório:

```powershell
Get-NetConnectionProfile
Get-NetFirewallRule -Enabled True -Direction Inbound |
  Get-NetFirewallPortFilter | Where-Object LocalPort -eq 1883

.\scripts\allow-mqtt-esp32.ps1 -BrokerAddress 192.168.18.14 -ReceiverAddress 192.168.18.27
```

O script cria somente a regra `Argos-MQTT-ESP32-Diagnostic`: TCP 1883, entrada na interface Wi-Fi,
destino 192.168.18.14, origem 192.168.18.27, perfis Public/Private. Não desativa o firewall
nem transforma toda a rede em privada. Verifica o IP local e não sobrescreve regra existente.
Se o IP do ESP32 mudar, ajuste conscientemente a regra; não libere indiscriminadamente todas as origens.

Conferir e, após o diagnóstico, remover apenas a regra criada:

```powershell
Get-NetFirewallRule -Name Argos-MQTT-ESP32-Diagnostic | Format-List
Get-NetFirewallRule -Name Argos-MQTT-ESP32-Diagnostic | Get-NetFirewallAddressFilter
# Somente quando decidir desfazer esta liberação:
Remove-NetFirewallRule -Name Argos-MQTT-ESP32-Diagnostic
```

Uma regra explícita de bloqueio ou política corporativa pode prevalecer sobre o allow.
Neste computador foi localizado exatamente esse caso: Docker Desktop Backend bloqueado no perfil
Público. Após criar a liberação restrita acima, execute como administrador:

```powershell
.\scripts\repair-docker-mqtt-firewall.ps1
```

O script identifica somente regras **Block/Inbound/TCP/Public/Any** do executável
`com.docker.backend.exe` e troca o filtro de portas por `1-1882,1884-65535`.
Assim, mantém o bloqueio das demais portas e permite que as regras allow existentes controlem 1883.
Não modifica regras UDP, outros aplicativos ou os demais perfis. Confere previamente que a
liberação de diagnóstico existe e corresponde à porta. Exibe o comando de reversão por regra.
Outras regras allow já existentes podem ter escopo mais amplo; revise-as no administrador antes
de expor a rede a clientes não confiáveis.

Se continuar falhando, confira logs do firewall e isolamento de clientes/AP/SSID de convidados
no roteador. Mesma sub-rede e ping não garantem acesso TCP de um cliente Wi-Fi a outro.

## Docker e broker

```powershell
docker compose --env-file broker/.env -f broker/docker-compose.yml ps
docker inspect argos-iot-emqx-1 --format '{{json .HostConfig.PortBindings}}'
docker compose --env-file broker/.env -f broker/docker-compose.yml logs --tail 80 emqx
Test-NetConnection 192.168.18.14 -Port 1883
```

Se o bind voltar a loopback, ajuste **somente** `MQTT_BIND_HOST` no `broker/.env`
para o IP LAN ou `0.0.0.0` com firewall restrito e execute:

```powershell
docker compose --env-file broker/.env -f broker/docker-compose.yml up -d --wait
```

Não execute `down -v`. `restart` sozinho não aplica mudanças de publicação de portas.
Não divulgue a saída completa de `docker compose config`, pois inclui variáveis privadas.
Avisos de bootstrap sobre usuário já existente não demonstram erro de senha: a carga inicial
preserva contas existentes; a autenticação efetiva deve ser testada separadamente.

## Como validar pelo Serial

O exemplo abaixo é ilustrativo; o canal real desta inspeção é 2:

```text
CONFIG: broker=192.168.18.14 porta=1883 modo=TCP_PURO canal_config=2 ...
WiFi: IP=192.168.18.27 canal=2 estado=3 ...
MQTT: tentativa ... flash=27 ...
TCP: OK broker=192.168.18.14:1883 ...
MQTT: autenticado
WiFi=3 MQTT=1 ... flash=0 ... publicadas=27 ...
```

- `TCP: FALHOU`: investigar caminho ESP32 → AP → firewall → Docker; credenciais ainda não foram enviadas.
- `TCP: OK` seguido de 4/5: investigar conta/permissão de conexão, sem alterar HMAC.
- `TCP: OK` seguido de -1: transporte aceito, mas não houve CONNACK válido; conferir listener/logs.
- MQTT autenticado com falha de publicação: verificar ACL do tópico/QoS/retain e logs do broker.
- Fila drenou: confirmar `persistidas` no worker e registros reais no Supabase; PUBACK não prova inserção.
- Fila não cresce mais e não há novas duplicatas: verificar TX/canal/alimentação, separadamente da conexão MQTT.

## Verificações de software

Compilação do receptor aprovada para ESP32, C3 e S3 em TCP, e ESP32 com TLS.
Testes nativos de protocolo/HMAC/fila aprovados; 13 testes do worker aprovados.
Consulta de banco somente leitura aprovada. Esses resultados não substituem teste de rádio,
esvaziamento da flash e gravação ponta a ponta com as placas.

## Cuidado com a gravação na COM10

A tabela de partições lida da placa coincide com a do build S3: aplicativo em `0x10000`,
partição LittleFS (rotulada `spiffs`) em `0x290000`, tamanho `0x160000`.
Não use binário merged nem erase-flash para este diagnóstico. A atualização deve gravar somente
o binário do aplicativo, mantendo NVS, tabela, bootloader, OTA data e filesystem.
A primeira tentativa de backup a 460800 baud falhou com `Read more than expected`;
nenhuma gravação foi realizada nessa tentativa. Não use arquivo incompleto como backup.

Referências: [ArduinoMqttClient 0.1.8](https://github.com/arduino-libraries/ArduinoMqttClient/blob/0.1.8/src/MqttClient.cpp)
e [New-NetFirewallRule](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule).
