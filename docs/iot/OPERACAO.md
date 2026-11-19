# Operação e diagnóstico IoT — Arduino IDE e EMQX

## 1. Broker local reproduzível

O Compose foi comparado com `origin/dev` e adaptado na `backend-iot`.
Não substitua containers/volumes de outros projetos.

1. Copie `infra/emqx/users.csv.example` para `infra/emqx/users.local.csv`.
   Substitua cada senha por um valor aleatório individual. O arquivo local é
   ignorado pelo Git; nunca use `is_superuser=true` para clientes MQTT.
2. As ACLs em `infra/emqx/acl.conf` autorizam cada RX somente no tópico do seu UUID;
   `argos-worker` só assina o filtro de detecções. Novos dispositivos precisam de
   usuário e regra próprios. R01 não está liberado por essa configuração.
3. Execute na raiz `docker compose --profile mqtt-local up -d emqx`.
   O perfil é a opção explícita de desenvolvimento sem TLS. Por padrão apenas
   o próprio computador acessa MQTT 1883 e painel 18083.
4. Para placas na LAN de laboratório, defina `$env:ARGOS_MQTT_BIND='0.0.0.0'`
   antes do comando. Use `Get-NetIPAddress -AddressFamily IPv4` para identificar
   o IP da interface conectada ao mesmo roteador das placas; não escolha loopback,
   VPN ou interfaces virtuais Docker. Restrinja o firewall à rede privada de teste.
5. Verifique `docker compose --profile mqtt-local ps`,
   `docker compose --profile mqtt-local exec emqx emqx ctl listeners` e
   `Test-NetConnection 127.0.0.1 -Port 1883`.

O bootstrap lê usuários quando cria o autenticador. Alterar o CSV não é rotação
automática de contas já existentes: use Access Control / Authentication / Users
no painel para atualizar senhas, preservando o volume. Nunca apague volumes para
trocar uma senha. Troque também a senha administrativa inicial do painel, que
está publicado somente em loopback.

Configuração efetiva: autenticação built-in com hash SHA-256 e salt; ACL com
negação por padrão e desconexão de operações proibidas; persistência de dados e
logs; reinício `unless-stopped`; health check `emqx ctl status`. Health do broker
não comprova persistência no Supabase. Sessão MQTT persistente não equivale a
armazenamento durável ilimitado de mensagens após falha do broker.

## 2. TLS e endereçamento

O Compose local desativa listeners TLS/WS/WSS: não publica 8883 com certificados
de exemplo. Para produção, configure EMQX com certificado válido para seu hostname,
listener TLS 8883 e cadeia de CA correspondente. Firmware: `ARGOS_LOCAL_PLAINTEXT=0`,
porta 8883 e CA PEM em `ArgosSecrets.h`. Worker: `mqtts://hostname:8883`, validação
de certificado ativa; CA privada pode ser instalada via `NODE_EXTRA_CA_CERTS`.

O `.env` existente do backend usa `mqtts` na porta 1883. A sondagem de 19/11 encerrou
o handshake com `ConnectionResetError`, antes de enviar credenciais. Porta por si
só não define o protocolo; confirme o listener remoto com seu administrador.
Esse arquivo foi preservado. Não basta trocar a porta ou desativar TLS às cegas.

No host, o worker local usa `mqtt://127.0.0.1:1883` com
`MQTT_ALLOW_INSECURE_LOCAL=true`. Dentro de uma rede Compose, use
`mqtt://emqx:1883`, `MQTT_INSECURE_HOST=emqx`, a mesma opção local e credenciais.
`NODE_ENV=production` recusa MQTT TCP mesmo com essas opções.
No ESP32 use IP LAN ou DNS alcançável, nunca `127.0.0.1` nem a porta 18083.

## 3. API e workers

Configure `backend/.env` usando seu exemplo, sem versionar chaves:

```powershell
pnpm --dir backend start
pnpm --dir backend mqtt:worker
```

O worker deve imprimir `Assinatura QoS 1 ativa`. SQLite guarda antes de PUBACK e
mantém pendências durante indisponibilidade do banco. `MQTT_HEALTH_PORT=3334`
habilita health HTTP somente em `127.0.0.1`; retorna 503 até uma sincronização
comprovada, 200 após sucesso com assinatura ativa e 503 após falha observada.
É o estado da última tentativa, não uma sondagem contínua do Supabase quando não
há eventos. Não confundir esse endpoint com `/api/health` da API Express.

Para localização, dentro de `iot/`, configure `.env` pelo exemplo e execute:

```powershell
.venv/Scripts/python.exe -m argos_iot.worker
```

`DATABASE_URL` precisa ser PostgreSQL, com TLS e permissões de servidor. O arquivo
local já existe e a auditoria confirmou conexão e permissões por consulta somente
de leitura. Não foi iniciado worker escritor contra produção durante a auditoria.
Sem `ARGOS_MODEL_DIR`, o log informa GRU não configurada e RSSI segue independente.

Coordenadas precisam compartilhar referencial/unidade e calibração física.
`calibracao_posterior` impede usar coordenadas modificadas depois da captura para
reinterpretar eventos antigos. `erro_residual_m` é ajuste matemático, não precisão
geográfica. O manifesto GRU exige `receiver_configuration`: objeto por UUID com
`x_m`, `y_m`, `rssi_1m_dbm`, `expoente_perda` iguais aos utilizados na validação de
campo. O treino gera esse objeto vazio e `aprovado=false`; aprovação e preenchimento
exigem evidência real. Configuração ausente/mudada impede inferência.

## 4. Arduino IDE

Há um sketch por função, reutilizado entre placas. Selecione na IDE a placa real
e o core **esp32 by Espressif Systems**; a matriz verificada usa 3.3.11.
Não selecionar `Arduino ESP32 Boards` presumindo que seja o mesmo core.
Compatibilidade verificada por compilação: ESP32 Dev Module, ESP32C3 Dev Module e
ESP32S3 Dev Module. Outros ESP32 com Wi-Fi/ESP-NOW exigem compilação e ensaio; ESP8266
usa APIs diferentes e chips sem Wi-Fi não executam este receptor.

Bibliotecas usadas nesta verificação: ArduinoMqttClient 0.1.8, ArduinoJson 7.4.3.
OLED é opcional e permanece desativado; pinos existentes não foram alterados.
Use partição com LittleFS. Não habilite formatação em uma placa com fila a preservar.

1. Configure UUID individual em `ArgosDevice.h`; confira no banco, não copie o
   UUID antigo das anotações para o TX-0001. Configure credencial MQTT individual.
2. Mesmo segredo HMAC em transmissores/receptores da propriedade.
3. Mesmo canal fixo no AP 2,4 GHz e nos dois `ArgosConfig.h`. Divergência agora
   desconecta o Wi-Fi e tenta novamente, mantendo a captura no canal configurado
   entre tentativas. Não há recepção simultânea garantida em canais diferentes.
4. Abra Serial a 115200. `ARGOS_LOG_LEVEL` vai de 0 a 4: ERROR=1, WARN=2, INFO=3,
   DEBUG=4. INFO mostra transições/contadores; DEBUG inclui eventos e PUBACK.
5. NTP primário é `ARGOS_NTP_SERVER`; fallbacks configuráveis
   `ARGOS_NTP_FALLBACK_1` e `ARGOS_NTP_FALLBACK_2`. Os padrões públicos dependem de
   DNS/internet. Em rede isolada, indique servidor funcional da rede.

Capturas têm tempo monotônico de 64 bits. Antes da primeira publicação, há espera
de até 60 segundos por NTP no mesmo boot. A primeira âncora permite retroprojeção
limitada a 30 minutos, sem atravessar reinicializações; o horário recuperado é
gravado antes de publicar. Sem evidência suficiente, transmite `detectado_em:null`.
NTP é uma referência operacional, não relógio autenticado nem garantia de precisão
metrológica. Ajustes posteriores não reescrevem capturas anteriores.

Limites mantidos: 256 capturas RAM, 512 arquivos persistentes e espaço mínimo livre.
Fila cheia descarta novas capturas e incrementa contador. ESP-NOW broadcast não
confirma entrega fim a fim. MQTT QoS1 confirma broker, não Supabase.

## 5. Confirmar uma detecção real

1. Ligue o broker e o worker com a assinatura ativa antes dos dispositivos.
2. Ligue receptor e transmissor. Confira Wi-Fi, canal, NTP, autenticação e fila no
   Serial. Anote um `evento_id` mostrado em DEBUG.
3. Verifique contadores do worker e consulte `deteccoes` pelo evento/receptor:
   compare `detectado_em`, `recebido_no_gateway_em`, `recebido_em`, vínculo e zona.
4. Consulte `/api/deteccoes` e `/api/monitoramento/resumo` com JWT do proprietário.
   Vários receptores do mesmo animal devem resultar em uma cabeça.
5. `GET /api/iot/localizacoes` e `/api/iot/predicoes` usam os contratos existentes.
   Lista vazia não prova modelo disponível; consulte log/configuração Python.
   Tabela não instalada agora retorna 503 `SERVICE_UNAVAILABLE`, inclusive hábitos
   cuja migração local preexistente não foi aplicada.
6. Teste desconexão MQTT mantendo ESP-NOW, depois reconexão e reinício com fila.
   Faça cortes de energia somente em hardware de teste. Registre resultados reais.

Ausência de leituras não comprova receptor fisicamente offline: pode não haver
coleiras próximas. Sem captura confiável não há associação retroativa de vínculo
ou zona. A janela de cinco minutos permanece; histórico de zonas exige uma futura
tabela de vigências receptor–zona, intervalos sem sobreposição e início conhecido,
sem preencher retroativamente períodos cuja instalação física é desconhecida.

## 6. Repetir ensaios isolados

O ensaio autenticado usa Compose com projeto `argos-auditoria`, portas 21883/28083
e nenhum worker de produção. O teste reinicia apenas esse container específico.

```powershell
$env:ARGOS_MQTT_PORT='21883'
$env:ARGOS_EMQX_DASHBOARD_PORT='28083'
docker compose -p argos-auditoria --profile mqtt-local up -d emqx
cd backend
$env:ARGOS_TEST_MQTT_URL='mqtt://127.0.0.1:21883'
$env:ARGOS_TEST_ISOLATED='true'
pnpm exec tsx --test tests/integracao/emqx-auth.ts
```

O ensaio preexistente `mqtt-offline.ts` precisa de broker descartável separado,
sem autenticação, somente em loopback (31883 na auditoria), pois gera UUIDs aleatórios
e usa API simulada. Essa exceção de teste não é a configuração operacional EMQX.
Não execute `ensaio-terminal.ts` contra produção: ele cria dados e exige autorização
específica. Consulte o relatório para a distinção dos testes executados.
