# Worker IoT Argos

Processo Node.js 24/TypeScript dedicado à ingestão. Não abre servidor HTTP e não usa serviços
da implementação antiga. MQTT.js, Supabase JS e proper-lockfile têm versões fixas e lockfile;
SQLite é o módulo `node:sqlite` incluído no Node 24.

## Configuração

```powershell
cd worker
npm ci
# Após provisionar o broker:
node --import tsx scripts/setup-local.ts 'https://SEU_PROJETO.supabase.co'
```

O setup copia as credenciais MQTT privadas e não sobrescreve `.env` existente. Alternativamente,
copie `.env.example` para `.env` e preencha manualmente. No arquivo local, configure
`SUPABASE_SECRET_KEY` com uma **Secret key** (`sb_secret_...`) obtida em **Settings → API Keys**
do projeto Argos no Supabase. `service_role` legado também é aceito. Chaves `anon`/publishable
são recusadas. Essa chave fica somente no servidor; não é necessária nas placas.
Veja [documentação das chaves](https://supabase.com/docs/guides/api/api-keys).

```powershell
npm run check:mqtt
npm run check:database
npm run build
npm start
```

`check:database` só consulta colunas, não insere dados. `npm start` passa a inserir as detecções
recebidas de dispositivos válidos. Aguarde o log `mqtt_assinado` antes de ligar as coleiras.
Mantenha um único processo com o mesmo `MQTT_CLIENT_ID` e a mesma fila. Não use PM2 cluster
nem várias réplicas concorrentes. Em outro servidor, transfira a fila e preserve Client ID/credencial.

| Variável | Padrão/finalidade |
|---|---|
| `MQTT_URL` | `mqtt://127.0.0.1:1883`; remoto seguro: `mqtts://hostname:8883` |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | Credencial exclusiva do worker |
| `MQTT_CLIENT_ID` | `argos-ingestion-v1`, estável entre reinícios |
| `MQTT_CA_FILE` | PEM de CA privada; vazio usa CAs do sistema |
| `MQTT_SESSION_EXPIRY_SECONDS` | 604800 (7 dias), compatível com retenção do broker |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | URL e chave de servidor do projeto |
| `QUEUE_PATH` | `./data/ingestion.sqlite`, relativo ao diretório de execução |
| `QUEUE_MAX_ITEMS` | 100000 registros totais, incluindo rejeitados |
| `DEAD_MAX_ITEMS` | 10000 registros em quarentena |
| `BATCH_SIZE` | 32, máximo 100 |
| `POLL_INTERVAL_MS` | 250 ms entre ciclos, sem sobreposição |
| `REQUEST_TIMEOUT_MS` | 10000 ms por chamada ao Supabase |
| `DEVICE_CACHE_MS` | 10000 ms, máximo 60000; use 0 para revalidar sem cache |
| `RETRY_BASE_MS`, `RETRY_MAX_MS` | 1000 / 60000, exponencial com jitter |

## Caminho de uma detecção

1. MQTT recebe QoS 1 não retido. Valida tópico, UTF-8, tamanho, os seis campos exatos,
   UUIDs, RSSI, bateria, horário e `evento_id` correspondente ao TX/nonce/sequência.
2. Grava no SQLite com WAL e `synchronous=FULL`. Só então retorna o callback que libera PUBACK.
   Falha de disco ou fila cheia desconecta sem confirmar; o broker guarda a mensagem da sessão.
3. Um único loop busca até 32 pendências prontas. Valida TX/RX, propriedade, tipos e status no banco,
   usando cache limitado a 1024 entradas/10 segundos para reduzir leituras repetidas.
4. Se há horário confiável, procura vínculo em `[inicio_em, fim_em)` do TX e propriedade.
   Não usa vínculo atual para leitura antiga. Mais de um vínculo válido é rejeição explícita.
5. Grava os registros válidos em um upsert de lote com `ignoreDuplicates` e conflito
   **`receptor_id,evento_id`**. Só remove do SQLite após sucesso do banco.

O mesmo evento em três RXs gera três registros. Duplicata do mesmo RX não altera o registro
anterior, inclusive horários. Uma queda depois do insert e antes de limpar SQLite resulta em reenvio
idempotente. Ao reenfileirar, o primeiro `recebido_no_gateway_em` permanece igual.

Erros transitórios (rede, timeout, autenticação, schema indisponível) mantêm dados pendentes.
Não existe limite de tentativas que descarte uma detecção válida. Falha de preparação interrompe
novas chamadas daquele lote; registros inválidos são isolados para não bloquear os demais.
Se o banco rejeitar um lote por constraint de um registro, tenta separadamente para identificar o item.

## Correspondência com o Supabase

- `detectado_em`: instante informado pelo firmware, ou null. Nunca substituído pelo horário de reenvio.
- `recebido_no_gateway_em`: primeira chegada ao worker, persistida no SQLite.
- `recebido_em`: default `now()` do banco, instante de inserção.
- `vinculo_id`: vínculo histórico no horário observado; null quando horário/vínculo inexistentes.
- `zona_id`: **null**. A tabela `zonas` só mostra a associação atual e não comprova a associação
  no momento de uma leitura que ficou em buffer. Não inferir retroativamente.
- `animal_id`: não existe em `deteccoes`; a identificação passa por `vinculos`.
- `dispositivos.ultima_comunicacao_em`: atualizada monotonicamente, no máximo uma vez por minuto
  por dispositivo em cada processo. RX usa chegada ao worker; TX usa captura quando disponível.
  Falha nessa atualização auxiliar gera log e não desfaz a detecção; uma leitura posterior tenta de novo.

O firmware não publica MAC no JSON; portanto o worker não pode conferir `identificador_hardware`
com evidência de rádio. Ele não inventa MAC nem cadastra dispositivos automaticamente.
Autorização de tópico é responsabilidade do broker: um tópico textual isolado não autentica ninguém.
HMAC é verificado no receptor, não no worker, pois o JSON não contém pacote/assinatura de rádio.
Mudanças de status/propriedade podem levar até o TTL do cache para aparecer; use `DEVICE_CACHE_MS=0`
quando for necessário revalidar a cada preparação. As FKs continuam sendo verificadas pelo banco.

Nenhum schema/RLS foi alterado. A consulta remota confirmou o índice
`deteccoes_evento_por_receptor_uk`. Para conferir manualmente no SQL Editor:

```sql
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'deteccoes';
```

O banco existente também tem um trigger após insert que agenda localização em sua própria tabela.
O worker não consome essa fila antiga nem executa localização/ML; esse comportamento do banco foi preservado.

## Operação e recuperação

Logs JSON: `mqtt_assinado`, `persistidas`, `mensagem_invalida`, `reagendada`, `rejeitada`,
`comunicacao_nao_atualizada` e `estado` a cada 30 segundos. Não incluem senhas nem payload bruto.
Mensagens malformadas são registradas e confirmadas sem ir ao banco; não há repetição útil possível.
Eventos com cadastro inválido ficam na quarentena para revisão, sem criação automática de dispositivos.

```powershell
npm run queue -- status
npm run queue -- rejected
# Pare o worker, corrija a causa e use uma chave mostrada acima:
npm run queue -- retry '<receptor_uuid>:<evento_id>'
```

Os dois comandos de consulta abrem o SQLite somente para leitura e podem rodar com o worker ativo.
`retry` exige o lock exclusivo. Quarentena cheia mantém os próximos registros pendentes com backoff;
não remove rejeitados automaticamente. Fila total cheia aplica backpressure até liberar espaço.
O limite é em registros, não em bytes: monitore espaço livre e faça backup da pasta de dados.
Use disco local, não compartilhamento de rede. Para backup simples, pare o worker e copie a pasta
inteira, incluindo eventuais arquivos `-wal`/`-shm`. Não apague a fila para resolver falha de conexão.

O lock impede dois processos na mesma fila. Após encerramento abrupto, aguarde pelo menos 30 segundos
antes de reiniciar. SIGINT/SIGTERM permitem fechamento ordenado quando o sistema operacional os entrega;
há prazo de 30 segundos. Em Windows, encerramento forçado pode deixar lock até expirar, sem apagar eventos.

Garantias são limitadas pela capacidade/retencão dos três pontos: flash do RX, armazenamento do broker
e SQLite. PUBACK ao receptor não significa que o Supabase já recebeu a detecção. O processo de ingestão
deve permanecer ativo, com sessão criada antes das transmissões e disco monitorado.

## Testes

```powershell
npm run build
npm test
npm run test:integration
```

Integração inicia EMQX próprio nas portas 11883/28083, usa banco HTTP simulado local e encerra somente
o projeto `argos-iot-test-<pid>` criado para o teste, incluindo seus volumes descartáveis.
Não utiliza o Supabase remoto e não interfere no broker `argos-iot`.
Veja [resultados e limitações](../docs/backend-iot/TESTES.md).
# Avisos da central — atualização de integração

`worker/` agora mantém avisos duráveis na mesma SQLite: rejeição e conclusão de recuperação
por propriedade. Upsert em `alertas` usa `propriedade_id,origem_evento` e ignoreDuplicates;
falhas deixam o aviso para retry. Não apague a fila ao atualizar. A migration existente da
central deve estar instalada. Testes: `npm run build`, `npm test` (incluem restart e ACK perdido).
Não execute simultaneamente `backend/src/mqtt`. Nenhuma alternativa foi desativada automaticamente.
Contrato, limitações e rollout: `docs/scrum/ENTREGA_ML_SQL.md` na raiz.
