# EMQX: conexão de firmware e worker

O broker do Argos é **EMQX**. MQTT é o protocolo, ArduinoMqttClient é o cliente do receptor e MQTT.js é o cliente do worker. Não é necessário trocar essas bibliotecas para usar EMQX.

## Nuvem com cota gratuita

Em 16/11/2026, EMQX Cloud Serverless informa 1 milhão de minutos de conexão e 1 GB de tráfego mensais gratuitos. Configure **Spend Limit = 0** para limitar o consumo à cota gratuita. Ela não representa disponibilidade ilimitada. Confira [limites oficiais](https://docs.emqx.com/en/cloud/latest/deployments/spend_limit.html). Três receptores mais um worker conectados continuamente por 30 dias consomem aproximadamente 172.800 minutos; tráfego depende do número de animais e frequência. Coleiras ESP-NOW não são clientes MQTT.

1. Crie um deployment **Serverless** na sua conta EMQX Cloud; guarde endpoint, porta TLS e CA fornecidos no painel. Não use a URL do painel como host MQTT.
2. Crie credenciais MQTT individuais para cada receptor e uma conta exclusiva para o worker. A conta administrativa do painel não é a conta MQTT.
3. Nas autorizações, cada receptor só pode **publicar** em `argos/v1/propriedades/PROPRIEDADE/receptores/RECEPTOR/deteccoes`. O worker pode **assinar** `argos/v1/propriedades/+/receptores/+/deteccoes`. Negue o restante. Não conceda assinatura a receptores, nem publicação ao worker.
4. Em `ArgosReceptor/ArgosSecrets.h`, configure endpoint (sem `mqtts://`), usuário, senha e CA PEM. Mantenha `ARGOS_LOCAL_PLAINTEXT=0`, porta `8883` (ou a porta fornecida pelo deployment). NTP precisa funcionar antes do handshake. Nunca use `setInsecure()`.
5. No `backend/.env`, configure `MQTT_URL=mqtts://ENDPOINT:8883`, `MQTT_CLIENT_ID=argos-ingest-01`, `MQTT_USERNAME`, `MQTT_PASSWORD` e `SUPABASE_SECRET_KEY`. O worker valida TLS pelo armazenamento de CAs do Node. Não exponha a chave Supabase no firmware.
6. Execute `pnpm --dir backend mqtt:worker` e aguarde **Assinatura QoS 1 ativa** antes de ligar os receptores. O broker precisa conhecer a assinatura para guardar mensagens durante desconexões do worker; a retenção da sessão é finita e depende do deployment.

O plano hospeda somente o broker. API, worker MQTT, Python e banco precisam continuar rodando em suas máquinas/serviços. Nenhuma conta Cloud é criada automaticamente por este código.

## EMQX local

Use o Compose autenticado e as ACLs versionadas conforme [OPERACAO.md](OPERACAO.md).
O perfil `mqtt-local` habilita explicitamente TCP de desenvolvimento; por padrão,
portas ficam em loopback. Os volumes preservam usuários e configurações. Não
substitua containers preexistentes nem remova volumes para ajustar credenciais.
O Compose local não habilita 8883 com certificado de exemplo; TLS de produção
requer certificado e hostname válidos. O teste isolado passou com EMQX 6.3.2.

## Conferência ponta a ponta

1. Cadastre propriedade, receptor, zona ativa, transmissor e vínculo. Confira UUIDs dos cabeçalhos locais; não presuma que os exemplos estejam cadastrados.
2. Mesmo segredo HMAC e canal Wi-Fi 2,4 GHz no transmissor e receptor. Confira o canal **2** atualmente configurado nos dois arquivos, ou ajuste ambos conforme o AP.
3. Observe `ESP-NOW aceito`, fila e `MQTT QoS1 confirmado` no Serial. PUBACK confirma o broker, não o banco.
4. No worker, confirme assinatura e contadores SQLite. No banco, confira `evento_id`, receptor, RSSI, `detectado_em`, `recebido_no_gateway_em` e `recebido_em`. Sem relógio não há atribuição segura de animal/zona.
5. Derrube a conexão do receptor ao broker mantendo o rádio local; confira fila LittleFS. Reconecte e verifique IDs estáveis e ausência de duplicatas.
6. Derrube o acesso ao Supabase mantendo EMQX acessível; reinicie o worker e confira que SQLite conserva pendências. Religue e confira sincronização.

**Limites:** 512 arquivos no receptor, fila RAM de 256 pacotes e retransmissão broadcast sem confirmação de cada receptor. Ao lotar, novas leituras podem ser perdidas e o contador aumenta. QoS 1 não protege contra expiração de sessão, perda do armazenamento do broker ou mensagens publicadas antes de existir assinatura. A fila não é garantia de coleta ilimitada. A montagem LittleFS falha sem formatar; use `ARGOS_FORMAT_FLASH=1` apenas para provisionamento deliberado.
