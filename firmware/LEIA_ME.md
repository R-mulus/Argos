# Argos — firmwares genéricos para Arduino IDE

**Existem somente dois sketches-fonte**: `ArgosReceptor/ArgosReceptor.ino` e `ArgosTransmissor/ArgosTransmissor.ino`. Os arquivos `.h` são partes de configuração/protocolo, não firmwares separados.

Para gravar outro dispositivo da mesma função, **altere apenas uma linha em `ArgosDevice.h`**: `#define ARGOS_DEVICE_UUID "..."`. Em seguida selecione a placa correta no Arduino IDE e envie. A mesma base de código é usada por todos os receptores e por todas as coleiras. Cada placa terá seu próprio binário porque o UUID é incorporado durante a compilação.

## UUIDs reais do projeto

**Receptores — `ArgosReceptor/ArgosDevice.h`**:

| Dispositivo | UUID (valor de `ARGOS_DEVICE_UUID`) | Coordenadas cadastradas |
|---|---|---|
| RX-001 | `9b3cc23c-7c82-4105-96ad-9e6ee7d7c607` | `(234751.53, -298098.9)` m em 19/11/2026; exige conferir referencial físico |
| RX-002 | `45bd6322-d705-4ea4-8bb2-cab702a1c094` | `(120, 0)` m |
| RX-003 | `83bba45a-c012-49f3-8db0-9fdd904d6128` | `(60, 100)` m |

**Transmissores — `ArgosTransmissor/ArgosDevice.h`**:

| Dispositivo | UUID | Observação |
|---|---|---|
| Transmissor atualmente vinculado ao animal de teste | `3fa85f64-5717-4562-b3fc-2c963f66afa6` | UUID padrão do pacote |
| T01 | `953f27e6-d0bf-452f-87d7-226776ac14ea` | Vínculo anterior encerrado; não localiza o animal de teste até haver vínculo ativo válido |

A propriedade cadastrada nos receptores é `8da8c584-e51b-4b99-808d-8cf55cee7674`. Não confunda `dispositivos.id` com um identificador legível (`RX-001` ou `T01`). O animal é associado ao transmissor no banco, não no sketch. Consulta de 19/11/2026: os três RX já têm zonas Piquete 1, 2 e 3; R01 continua em Curral 01. Coordenadas cadastradas não comprovam instalação/calibração física.

## Configuração inicial ÚNICA (não precisa mudar a cada placa)

1. Instale Arduino IDE 2.x, a placa **esp32 by Espressif Systems** (referência do projeto: core `3.0.7`). Placas: `ESP32S3 Dev Module`, `ESP32 Dev Module` ou `ESP32C3 Dev Module`, conforme seu hardware real. A denominação ESP32-U, por si só, não determina o modelo da placa no menu. Compilação verificada com core 3.3.11 (receptor S3 e transmissor C3); ensaio com placas físicas pendente.
2. Instale para o receptor: **ArduinoMqttClient** `0.1.8` e **ArduinoJson** `7.4.2`. Para display OLED opcional, também Adafruit SSD1306 e dependências. O transmissor não utiliza MQTT.
3. Copie `ArgosSecrets.h.example` para **`ArgosSecrets.h`**, em CADA pasta de sketch. Configure Wi-Fi, endpoint EMQX Cloud ou IP local do computador com EMQX e o segredo HMAC aleatório de 32 ou mais caracteres. **O segredo HMAC deve ser exatamente igual em transmissor(es) e receptor(es)**. Os arquivos `ArgosSecrets.h` não fazem parte do ZIP e não devem ser versionados.
4. O receptor usa **TLS por padrão**: `ARGOS_LOCAL_PLAINTEXT=0` e MQTT `8883`. Configure CA e credenciais do EMQX. Para ensaio local isolado, altere para `ARGOS_LOCAL_PLAINTEXT=1` e porta `1883`. Consulte [EMQX](../docs/iot/EMQX.md). Nunca use `127.0.0.1` no ESP32; use o **endpoint Cloud** ou o **IP LAN do computador** no modo local. `ARGOS_MQTT_USER` e `ARGOS_MQTT_PASS` são obrigatórios também em laboratório. **Em produção, usar TLS, ACL e credenciais individuais por dispositivo, que exigem provisionamento além do UUID**.
5. Fixe o canal do Wi-Fi 2,4 GHz do roteador para o mesmo `ARGOS_WIFI_CHANNEL` em ambos `ArgosConfig.h` (valor atual **2**). Nunca assuma que o ESP-NOW receberá se o roteador mudar de canal. Rede 5 GHz não serve.
6. O receptor usa `pool.ntp.org` como servidor NTP por padrão; precisa ter acesso à internet para acertar a hora. Em rede isolada, configure um servidor NTP local realmente funcional antes do teste. **Sem NTP, `detectado_em` será null e o algoritmo de localização poderá recusar o evento**.
7. Se a partição LittleFS da placa estiver vazia e a montagem falhar, configure `ARGOS_FORMAT_FLASH=1` em `ArgosReceptor/ArgosConfig.h` somente no primeiro provisionamento; grave, confirme a montagem e **volte a 0 e grave novamente**. A formatação apaga arquivos armazenados no filesystem. Configure o esquema de partição com espaço para LittleFS.

## Gravação individual

- **RX-001**: abra `ArgosReceptor.ino`, ponha o UUID de RX-001 no único `ArgosDevice.h`, selecione a placa física, compile/envie e marque a unidade.
- **RX-002**: no **mesmo sketch** substitua apenas o UUID pelo de RX-002, selecione a placa correta, compile/envie. Não substitua o arquivo `.ino` por cópias específicas.
- **RX-003**: repita com UUID de RX-003.
- **Coleiras**: abra `ArgosTransmissor.ino`; para cada coleira, altere apenas o UUID do seu `ArgosDevice.h` e compile/envie. Não replique UUIDs simultaneamente em duas placas.

Se quiser manter versões compiladas para diferentes modelos, use os mesmos fontes e guarde os artefatos de compilação por modelo/UUID; não crie sketches divergentes.

## Fluxo preservado

Transmissor ESP-NOW -> 1/3 receptores capturam **RSSI** + horário -> HMAC e fila RAM -> persistência LittleFS -> JSON UTF-8 MQTT QoS1 no tópico `argos/v1/propriedades/{propriedade_id}/receptores/{receptor_id}/deteccoes` -> Worker Node.js -> Supabase -> Job IoT -> Worker Python -> localização RSSI. Cada retransmissão da coleira mantém o mesmo `evento_id`, permitindo agrupar leituras de receptores diferentes; o código já deduplica recepções repetidas no mesmo receptor.

O Monitor Serial **115200** agora mostra UUID, tópico, eventos aceitos/RSSI, confirmação MQTT e estado de hora. O transmissor também mostra seu evento antes de entrar em *deep sleep*.

A GRU mensal executa no **worker Python**, não no firmware: veja [hábitos por zona](../docs/iot/HABITOS.md). Ela usa histórico de observações por zona e não requer posições medidas. O pipeline anterior de coordenadas permanece experimental e separado; nenhum teste sintético demonstra precisão em campo.

## Limites e cuidados

- Uma única identificação diferente por dispositivo funciona bem em **laboratório controlado** com configurações compartilhadas. Para deployment real, credenciais MQTT por dispositivo, segredo HMAC seguro e eventuais ajustes de pinos de OLED/bateria exigem provisionamento adicional.
- `ARGOS_OLED=0` por padrão para que o mesmo receptor compile em placas sem display. Se houver OLED, ajuste `ARGOS_OLED=1` e os pinos I²C conforme a placa; isso é opção de hardware, não alteração na lógica do receptor.
- Beacons não trazem posição do animal; apenas identidade, sequência e campo de bateria não medida (255), sem falsificar percentual. A posição é calculada no servidor.
- QoS 1 confirma recebimento do broker, não a gravação no Supabase. Teste reinicializações e indisponibilidade da rede antes do uso real.
- Segredos e senhas não devem ser enviados ao ESP32 por frontend, e chaves do Supabase nunca devem entrar no firmware.

## Teste recomendado

1. Com **RX-001** ligado e MQTT local funcionando, grave uma coleira com UUID **vinculado** ao animal. Abra Monitor Serial e confira `ESP-NOW aceito` e `MQTT QoS1 confirmado`.
2. Confirme no Supabase `public.deteccoes` o `evento_id`, receptor e `detectado_em` não nulo.
3. Grave **RX-002** e **RX-003** usando o mesmo sketch mas UUIDs diferentes. Compare o mesmo evento nos três, consulte `argos_iot_jobs` e `argos_localizacoes`.
4. Inicie a consolidação diária de hábitos desde a primeira coleta. Treino mensal exige meses de histórico; não ative um modelo treinado apenas com dados simulados.

Consulte o [procedimento operacional atualizado](../docs/iot/OPERACAO.md) para NTP com fallback, recuperação no mesmo boot, logs e matriz de compatibilidade Arduino IDE.
