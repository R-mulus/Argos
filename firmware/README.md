# Firmware genérico — Arduino IDE

Dois sketches: `ArgosTransmissor/ArgosTransmissor.ino` (coleira C3) e `ArgosReceptor/ArgosReceptor.ino` (S3/DevKit V1/ESP32 clássico com antena externa). O protocolo compartilhado está copiado nos dois diretórios para abrir diretamente na Arduino IDE; teste Python verifica que as cópias são iguais. Modificações futuras devem atualizar ambas.

## Preparar e gravar

1. Arduino IDE 2.x, pacote **esp32 by Espressif Systems 3.0.7**, versão de referência de compilação. Placas C3 Dev Module, S3 Dev Module e ESP32 Dev Module. Confira o modelo/flash/partição/pinos reais antes do upload; “ESP32-U” descreve antena/conjunto e não resolve sozinho o FQBN. A assinatura do callback de envio tem adaptação para IDF 5.5+, mas versões posteriores não estão automaticamente validadas.
2. Receptor: instale **ArduinoMqttClient 0.1.8**, **ArduinoJson 7.4.2**. Para OLED opcional: **Adafruit SSD1306 2.5.15**, GFX e BusIO (dependências do Library Manager). WiFi, ESP-NOW, LittleFS e mbedTLS vêm com o core. O transmissor não precisa de MQTT/Wi-Fi com senha.
3. Copie `ArgosSecrets.h.example` para `ArgosSecrets.h` em cada sketch e preencha fora do Git. Gere segredo HMAC aleatório forte por propriedade, igual nas coleiras e receptores. Não reutilize as senhas de demonstração dos anexos. MQTT usa credenciais individuais por receptor e CA real do broker; não há `setInsecure()`.
4. Ajuste `ArgosConfig.h`: UUID real do transmissor; UUID de propriedade/receptor; canal do AP; NTP **local**; host/porta do broker. Os UUIDs fornecidos no contexto são referências, não cadastro automático. O cabeçalho do transmissor contém A001/TX-0001 e o UUID esperado do animal; o banco determina o vínculo histórico verdadeiro.
5. Fixe no roteador o canal 2.4 GHz igual ao ESP-NOW. Não use canal automático nem rede 5 GHz. Configure partição com espaço LittleFS no receptor. Se ainda não houver filesystem, habilite `ARGOS_FORMAT_FLASH=1` **uma única vez** no provisionamento e volte a 0. Falha de montagem em operação não formata nem apaga dados automaticamente.
6. Compile, grave via USB e abra Monitor Serial 115200. Verifique hora NTP antes do ensaio de localização. Teste primeiro um receptor, depois três. Coleiras só emitem ESP-NOW; os receptores publicam MQTT pela LAN.

| Equipamento do contexto | Configuração do mesmo receptor |
|---|---|
| RX-001 / S3 | UUID `9b3cc23c-7c82-4105-96ad-9e6ee7d7c607` |
| RX-002 / DevKit V1 | UUID `45bd6322-d705-4ea4-8bb2-cab702a1c094` |
| RX-003 / ESP32-U | UUID `83bba45a-c012-49f3-8db0-9fdd904d6128`; OLED opcional |

OLED: habilite `ARGOS_OLED=1` e confirme SDA/SCL da placa (defaults 21/22 apenas para ESP32 clássico). Exibe conexão, fila e perdas locais. Coordenadas são consultadas pela API/frontend; esta versão não mantém a consulta HTTP ao painel OLED do MVP.

## Comportamento e limites

- Beacon binário de 52 bytes: versão, UUID da coleira, nonce de boot de 64 bits, sequência RTC, bateria opcional, HMAC-SHA256 truncado em 128 bits. Bateria 255 indica não medida.
- A mesma transmissão é repetida três vezes com jitter, mantendo o ID. O transmissor espera callback de rádio antes do deep sleep, com timeout. Confirmação de broadcast não prova que três receptores receberam; validar perda em campo.
- Receptor captura RSSI e horário no callback e copia para fila RAM limitada. HMAC, JSON, flash e rede ficam fora do callback. Fila RAM: 256 leituras. Flash: até 512 eventos; cheia preserva os antigos e conta os descartados no Serial/OLED. Dimensione limites/partição e vida útil da flash conforme número de animais/intervalo.
- LittleFS escreve temporário, fecha e renomeia antes de publicar. Arquivo é removido apenas após PUBACK QoS1. Reinicialização entre confirmação e remoção causa replay idempotente. Temporário completo é recuperado no boot; parcial é contabilizado. JSON corrompido na fila é movido para `/quarantine` para diagnóstico, permitindo enviar os demais; a quarentena também ocupa flash e exige manutenção. Queda durante captura ainda em RAM pode perder amostras: isso requer ensaio físico, não promessa de perda zero.
- Canal do AP diferente de `ARGOS_WIFI_CHANNEL` não para mais o receptor: ele desconecta, avisa no Serial e continua captando na flash. `ARGOS_MQTT_HOST "gateway"` usa o IP do ponto de acesso (notebook como hotspot). O Serial informa motivo de desconexão do Wi-Fi, código de erro MQTT (`connectError`), sincronização da hora e contadores `HoraRecuperada`/`SemHora`.
- MQTT reconecta com backoff/jitter. Wi-Fi tenta reconectar sem loop de espera longa; handshakes MQTT/TLS têm timeout. Durante associação Wi-Fi/varredura há possível interrupção de recepção; rádio único não garante escuta contínua em todos os cenários.
- Leitura feita antes do NTP fica retida na flash com o relógio monotônico do boot (campos locais `_b`/`_ms`, removidos antes do MQTT). Quando a hora sincroniza no mesmo boot, recebe o horário real; após reinício ou `ARGOS_TIME_WAIT_S` (10 min) segue com `detectado_em:null`. NTP consultado: `ARGOS_NTP_SERVER` (opcional), gateway do Wi-Fi e `ARGOS_NTP_FALLBACK`. TLS aguarda a hora. Dados sem hora não localizam nem associam animal. Roteiro de rede, NTP no Windows e mensagens do Serial: `../docs/iot/ENSAIO.md`.
- Sessão durável do **worker** deve existir antes dos receptores. Broker deve persistir mensagens QoS1, usuários e sessão em disco. PUBACK confirma broker, não commit no Supabase; a fila SQLite do worker protege a próxima etapa. Uma falha de energia do broker entre ACK e flush ainda depende da configuração/garantias do broker.
- IDs, HMAC e chaves MQTT não substituem isolamento físico/provisionamento. Replay de beacon antigo ainda desconhecido pode parecer novo, pois coleira não tem relógio confiável. O banco deduplica eventos conhecidos. Rotação de segredo exige reprovisionar o grupo.
- Watchdog padrão do ESP32 permanece ativo; não há OTA remota, reconfiguração via MQTT nem comandos capazes de apagar dados. Firmware não cobre literalmente “qualquer evento”: testes de energia, bateria, alcance, antena, reconexão e desgaste são necessários.
- LoRaMESH/LoRaWAN não estão implementados. RSSI do último salto mesh não pode ser usado como distância direta da coleira.

## Broker

Use TLS 8883, `allow_anonymous false`, persistência e contas individuais. ACL de receptor deve permitir **somente** publicar em seu tópico exato. Worker pode ler `argos/v1/propriedades/+/receptores/+/deteccoes`; não permita receptores publicarem em `+`/`#` nem em outra propriedade. Configure session/client ID fixo do worker (já feito no backend).

Exemplo de ACL Mosquitto (substitua placeholders, gere arquivo de senhas com `mosquitto_passwd`):

```text
user receptor-UUID_RX
topic write argos/v1/propriedades/UUID_PROPRIEDADE/receptores/UUID_RX/deteccoes
user argos-worker
topic read argos/v1/propriedades/+/receptores/+/deteccoes
```

`ARGOS_LOCAL_PLAINTEXT=1` e porta 1883 são opção explícita de laboratório isolado; produção usa TLS. Teste recusa de escrita no tópico de outro receptor.

## Aceite em bancada/campo

1. Confirmar mesmo evento nos três receptores e três registros no banco; repetir não cria duplicatas.
2. Desligar internet mantendo LAN/NTP/broker; verificar SQLite e retomada sem renovar `detectado_em`.
3. Interromper broker; verificar flash e reenvio após volta. Cortar energia durante gravação/reenvio e inspecionar fila.
4. Forçar fila cheia, segredo inválido, receptor não cadastrado, canal errado e horário inválido; verificar contadores/rejeições sem dados falsos.
5. Medir erro em pontos conhecidos dentro/fora da geometria dos receptores e em animais em movimento.
6. Medir consumo da coleira em sono/transmissão, autonomia real e perda de pacotes; não derivar autonomia apenas do intervalo.

Fontes de API consultadas: ArduinoMqttClient `src/MqttClient.cpp` 0.1.8 (`endMessage()` aguarda PUBACK), core ESP32 3.0.7/headers ESP-NOW e compilador fornecido pelo Board Manager. Ver `../docs/iot/VALIDACAO.md` para resultados executados.
