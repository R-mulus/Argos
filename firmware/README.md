# Firmware Argos

## 1. Dependências e placas

Use Arduino IDE 2 e o pacote **esp32 by Espressif Systems 3.3.11**.
Não selecione `Arduino ESP32 Boards` (outro pacote, voltado ao Nano ESP32).
Instale pelo gerenciador de bibliotecas **ArduinoMqttClient 0.1.8** e **ArduinoJson 7.4.3**.
WiFi, LittleFS, FreeRTOS, mbedTLS e SNTP acompanham o core.

Copie a pasta `firmware/libraries/ArgosProtocol` para a pasta `libraries` do seu Sketchbook
(caminho configurado em Preferências da IDE) e reinicie a IDE. Essa biblioteca compartilhada
evita duas implementações divergentes do pacote de rádio. Atualize a cópia ao atualizar o firmware.
No CLI, `--libraries firmware/libraries` usa diretamente a versão do repositório.

| Hardware | Seleção na IDE | FQBN CLI |
|---|---|---|
| ESP32 DevKit V1 clássico | ESP32 Dev Module | `esp32:esp32:esp32` |
| ESP32-C3 | ESP32C3 Dev Module | `esp32:esp32:esp32c3` |
| ESP32-S3 | ESP32S3 Dev Module | `esp32:esp32:esp32s3` |

Selecione o tamanho real da flash. O receptor precisa de partição de dados compatível com
LittleFS (o esquema padrão do core, com partição rotulada `spiffs`, serve).
Não há GPIO de sensor/OLED obrigatório. C3/S3 podem exigir `USB CDC On Boot: Enabled`
para Serial pela USB nativa; DevKit clássico normalmente usa conversor USB/UART.
Deep sleep do TX pode desconectar a USB nativa; entre em modo BOOT para regravar quando necessário.
Core 2.x não é suportado: o receptor usa o callback com RSSI do core 3.x.

## 2. Identidade por placa

Execute na raiz, uma vez para cada sketch:

```powershell
Copy-Item firmware/ArgosTransmissor/ArgosDevice.example.h firmware/ArgosTransmissor/ArgosDevice.local.h
Copy-Item firmware/ArgosTransmissor/ArgosSecrets.example.h firmware/ArgosTransmissor/ArgosSecrets.h
Copy-Item firmware/ArgosReceptor/ArgosDevice.example.h firmware/ArgosReceptor/ArgosDevice.local.h
Copy-Item firmware/ArgosReceptor/ArgosSecrets.example.h firmware/ArgosReceptor/ArgosSecrets.h
```

Não repita esses comandos sobre arquivos já configurados. Os arquivos locais estão no `.gitignore`.
Abra cada `ArgosDevice.local.h` e preencha:

- `ARGOS_DEVICE_ID`: `id` do registro em `public.dispositivos`.
- `ARGOS_DEVICE_CODE`: `codigo` amigável desse mesmo registro.
- `ARGOS_PROPERTY_ID`: `propriedade_id` desse dispositivo.

Use o tipo `transmissor` para TX e `receptor` para RX, ambos com `status = 'ativo'`.
Para localizar registros, execute no SQL Editor do Supabase:

```sql
select id, codigo, tipo, status, propriedade_id, identificador_hardware
from public.dispositivos
order by propriedade_id, tipo, codigo;
```

Escolha conscientemente os registros das placas do ensaio; não reutilize um receptor em duas placas.
Se precisar cadastrar, use o cadastro de dispositivos da aplicação ou o Table Editor,
informando propriedade existente, código e tipo. O banco gera o UUID; copie-o depois de salvar.
O MAC STA aparece no Serial e pode ser cadastrado como `identificador_hardware`.
O firmware não cria nem modifica registros no banco. No TX, a propriedade é configuração
de provisionamento; não foi adicionada ao pacote binário legado. O worker deve verificá-la pelo cadastro.

Para gravar RX-001, RX-002 e RX-003, altere somente o arquivo local de identidade e as credenciais
MQTT antes de cada gravação. O código principal é o mesmo. Guarde configurações individuais fora do Git.

## 3. Chaves e credenciais necessárias

**Nenhuma chave Supabase vai no ESP32.** São necessárias:

1. **Segredo HMAC por propriedade:** gere uma vez com o comando abaixo. Cole os mesmos 64 caracteres
   em `ARGOS_BEACON_SECRET` de todos os TXs/RXs daquela propriedade. Não use o valor de teste.
2. **Wi-Fi do receptor:** `ARGOS_WIFI_SSID` e `ARGOS_WIFI_PASS` da rede 2,4 GHz.
3. **MQTT individual por receptor:** usuário e senha criados no broker, preenchidos em
   `ARGOS_MQTT_USER`/`ARGOS_MQTT_PASS`. Não use o usuário administrativo do dashboard.
4. **CA PEM**, somente no modo TLS: obtenha do administrador/emissor do certificado do broker.

Gerar segredo localmente no PowerShell, sem instalar pacote:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
```

No EMQX, configure autenticação por senha com banco interno e crie um usuário por RX,
sem privilégio de superusuário. Autorize esse usuário a publicar **somente** em
`argos/v1/propriedades/<UUID_PROPRIEDADE>/receptores/<UUID_RX>/deteccoes`, QoS 1,
e negue os demais tópicos. O usuário do worker deve ter assinatura no filtro de detecções.
Não basta configurar o Client ID: a restrição precisa estar associada à credencial autenticada.
Fontes: [autenticação EMQX](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/mnesia.html)
e [ACL EMQX](https://docs.emqx.com/en/emqx/latest/guides/access-control/authz/file.html).

O worker em `worker/` precisa da URL do projeto e de uma chave de servidor do Supabase.
No dashboard do projeto, abra **Settings → API Keys** e obtenha uma **Secret key**
(ou `service_role` legado, se o worker usar esse formato). Armazene apenas no ambiente do servidor.
Ela não é o segredo HMAC, nem a senha MQTT, nem uma chave publicável do frontend.
Referência: [chaves Supabase](https://supabase.com/docs/guides/api/api-keys).
Não foi necessário obter essa chave para esta entrega ou para a inspeção somente leitura via conector.

## 4. Rádio e rede

Configure `ARGOS_WIFI_CHANNEL` igual nos dois `ArgosConfig.h` e fixe o roteador nesse canal
(padrão 6, 2,4 GHz). Não use seleção automática de canal. TX usa broadcast ESP-NOW;
RX usa o mesmo rádio para ESP-NOW e Wi-Fi. Ao detectar AP em canal diferente, o RX desconecta,
restaura o canal configurado e informa o erro, sem apagar a fila. Tentativas de associação podem
causar pequenas lacunas de recepção; não há garantia de captura durante falhas/reconexões de rádio.

O TX envia a cada 5 segundos + jitter, com 3 cópias do mesmo evento e potência configurada
em 13 dBm (52 unidades de 0,25 dBm), depois entra em deep sleep. Não há medição de bateria:
envia 255 no rádio, convertido em `null` no JSON. Calibre RSSI após qualquer mudança de antena,
caixa, altura, potência ou placa. RSSI não é posição ou distância exata.

No RX, `ARGOS_MQTT_HOST` deve ser o IP LAN do computador ou hostname do broker.
`localhost` aponta para o próprio ESP32 e é recusado. O broker deve escutar na interface LAN
(ou `0.0.0.0` com firewall restrito à LAN), e não apenas em `127.0.0.1`.

Modo de bancada: `ARGOS_LOCAL_PLAINTEXT=1`, porta 1883, LAN controlada e autenticação obrigatória.
Produção: `ARGOS_LOCAL_PLAINTEXT=0`, porta 8883, hostname válido e `ARGOS_MQTT_CA` com PEM:

```cpp
#define ARGOS_MQTT_CA R"PEM(-----BEGIN CERTIFICATE-----
...CA fornecida pelo administrador do broker...
-----END CERTIFICATE-----
)PEM"
```

Não há `setInsecure()`. TLS espera sincronização NTP. Ajuste `ARGOS_NTP_SERVER` para um servidor
local acessível se não houver internet. Após 24h sem sincronização, novas leituras voltam a horário
nulo e novas conexões TLS esperam NTP. Registros já persistidos mantêm o horário original.

## 5. Compilar e gravar

Na IDE, abra `ArgosTransmissor.ino` ou `ArgosReceptor.ino`, selecione placa/porta e clique Verificar.
Para o **primeiro uso** da flash do receptor, configure `ARGOS_FORMAT_FLASH=1`, grave e deixe iniciar.
Depois volte para **0** e grave novamente sem apagar toda a flash. A opção só formata quando a montagem
falha. Nunca habilite esse recurso para tentar recuperar uma fila existente: a formatação apaga os dados.

No CLI (instalado no PATH):

```powershell
arduino-cli core install esp32:esp32@3.3.11
arduino-cli lib install 'ArduinoMqttClient@0.1.8' 'ArduinoJson@7.4.3'
./scripts/compile-firmware.ps1
arduino-cli board list
arduino-cli upload --fqbn esp32:esp32:esp32 --port COM5 firmware/ArgosReceptor --input-dir .build/ArgosReceptor-esp32
arduino-cli monitor --port COM5 --config baudrate=115200
```

Configure o índice de placas Espressif no Arduino antes de instalar o core:
`https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
Substitua COM5 e o FQBN pela placa real. O script compila seis combinações TX/RX e mais RX/TLS.
Se o CLI só estiver instalado com a IDE, passe seu caminho:
`./scripts/compile-firmware.ps1 -ArduinoCli '<caminho-do-arduino-cli.exe>'`.
Os binários de teste sem identidade não estão prontos para operação.

## 6. Fila, recuperação e limites

O callback copia pacote, RSSI e horário para uma fila FreeRTOS de 128 leituras; não faz HMAC,
JSON, rede ou flash. O loop valida HMAC e campos, elimina repetições recentes e persiste em LittleFS.
Cada registro ocupa 65 bytes de conteúdo, além de metadados/blocos do filesystem.
Limite padrão: 512 registros e reserva mínima de 16 KiB livres. Ao encher, preserva antigos e
contabiliza novas leituras descartadas. Aproximadamente 512 eventos correspondem a 43 minutos com
um TX a cada 5 segundos ou 51 segundos com 50 TXs nesse intervalo, desconsiderando jitter/overhead.
A capacidade real pode ser menor por causa da partição e dos metadados.

Grava em `/writing.tmp`, fecha, depois renomeia para `/q/<evento>.bin`. No boot recupera temporário
completo; parcial/corrompido vai para `/bad`. Não apaga automaticamente quarentena.
CRC detecta corrupção local; HMAC valida o pacote de rádio. Falha ao concluir o rename preserva
o temporário e interrompe aquisição até reiniciar. Monte/recupere antes de voltar a receber.

Publica QoS 1, `retain=false`; remove o arquivo somente após `endMessage()` confirmar PUBACK.
Uma queda entre PUBACK e remoção pode reenviar: o banco já possui unicidade `(receptor_id, evento_id)`.
A ordem de saída depende da enumeração do filesystem, não representa ordem temporal.
Troca de UUID/propriedade com fila pendente é bloqueada. Drene antes de trocar identidade ou segredo.
Mudança do segredo com registros pendentes invalida o HMAC desses registros e os separa na quarentena.

PUBACK confirma o broker, **não** a gravação no Supabase. Para durabilidade de ponta a ponta,
o broker e o worker também precisam de persistência e deduplicação. Não há ack do banco para o ESP32.
Até 128 leituras em RAM, um temporário incompleto e pacotes ainda no rádio podem se perder numa
queda de energia. Testes em disco não provam atomicidade nem vida útil da flash real.
Há uma gravação por evento; dimensione taxa/partição e meça desgaste antes de uso contínuo intensivo.

O HMAC usa chave compartilhada por propriedade: autentica o grupo, não isola um TX comprometido
dos demais. Não cifra o broadcast e não impede captura/replay; a deduplicação preserva identidade
do evento já conhecido. UUID é público, não senha. Não use uma única chave para todas as propriedades.

## 7. Diagnóstico

| Sintoma | Verificação |
|---|---|
| `CONFIG` | Arquivos locais, UUID canônico, segredo >=32 caracteres, Wi-Fi/usuário/senha/host |
| `FLASH` no primeiro boot | Partição de dados e provisionamento explícito; não formate fila existente |
| Sem recepção | Canal fixo igual, firmware ESP-NOW em ambas as placas, distância/antena/alimentação |
| `invalidas` crescendo | Segredo, versão, tamanho, UUID, RSSI e bateria recebidos |
| `WiFi` desconectado | SSID/senha, rede 2,4 GHz, canal do roteador; isolamento de clientes |
| MQTT `-2` | TCP/DNS/TLS: host, porta, bind, firewall, CA e hostname; não prova senha errada |
| MQTT `-1` | Timeout esperando resposta; conferir listener/protocolo/rede |
| MQTT `1/2/3` | Protocolo recusado, Client ID recusado, servidor indisponível |
| MQTT `4/5` | Usuário/senha ou autorização de conexão; confira log do broker |
| MQTT conectado, sem ingestão | ACL de publicação, tópico, assinatura do worker e logs; PUBACK não prova autorização/persistência |
| `NTP=0` | Servidor de hora acessível; `detectado_em=null` é esperado até sincronizar |
| `perdidas`/`flash_descartadas` | RAM cheia, flash cheia, filesystem com erro ou quarentena ocupando espaço |

Use `Test-NetConnection <IP-LAN-do-broker> -Port 1883` em outro computador da mesma LAN.
Teste positivo no computador não comprova a rota do ESP32. Confirme também IP/canal no Serial e
conexão autenticada no dashboard do broker. Em TLS use 8883; não misture listener WebSocket com TCP.
Uma ACL de publicação negada pode aparecer apenas no log do broker (MQTT 3.1.1 não fornece
motivo de rejeição no PUBACK). Faça um teste explícito de tópico permitido e outro proibido.

Referências técnicas: [ESP-NOW Espressif](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/espnow.html)
e [implementação ArduinoMqttClient 0.1.8](https://github.com/arduino-libraries/ArduinoMqttClient/blob/0.1.8/src/MqttClient.cpp).
