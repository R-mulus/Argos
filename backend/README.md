# API Argos — cadastros e vínculos IoT

Backend Express 5 + TypeScript + Supabase Auth/PostgreSQL. A sessão é criada pelo frontend no Supabase Auth; **o backend valida cada token Bearer** via `auth.getUser(token)` e executa consultas com um cliente Supabase configurado com o JWT recebido, mantendo as políticas RLS.

## Executar

Na raiz do monorepo, instale dependências com `pnpm install`, copie `backend/.env.example` para `backend/.env` e preencha `SUPABASE_PUBLISHABLE_KEY` no painel do projeto Argos. A chave `service_role` **não é utilizada nesta API**.

Na pasta `backend/`: `pnpm dev`. Verificação de tipos: `pnpm typecheck`. Testes de validação: `pnpm test`.

A variável `CORS_ORIGIN` aceita origens separadas por vírgula. Valor padrão: `http://localhost:5173`.

## Contrato HTTP

Rotas públicas: `GET /` e `GET /api/health`.

Todas as outras rotas exigem `Authorization: Bearer <access_token>` do Supabase Auth.

| Método | Caminho | Descrição |
| --- | --- | --- |
| GET | `/api/propriedades/minha` | Busca propriedade do usuário (404 se não existe) |
| POST | `/api/propriedades` | Cadastra a única propriedade do usuário |
| PATCH | `/api/propriedades/minha` | Atualiza nome/município/UF |
| GET | `/api/animais?limit=20&offset=0` | Lista animais e total |
| GET | `/api/animais/:id` | Detalhes de um animal |
| POST | `/api/animais` | Cadastra animal na propriedade |
| PATCH | `/api/animais/:id` | Atualiza animal (use `status: "inativo"` para desativar) |
| GET/POST | `/api/dispositivos` | Lista e cadastra transmissores/receptores |
| GET/PATCH | `/api/dispositivos/:id` | Consulta e atualiza dispositivo |
| GET/POST | `/api/zonas` | Lista e cadastra zonas de detecção |
| GET/PATCH | `/api/zonas/:id` | Consulta e atualiza zona |
| GET/POST | `/api/vinculos` | Lista histórico e vincula transmissor a animal |
| GET | `/api/vinculos/:id` | Consulta vínculo histórico |
| PATCH | `/api/vinculos/:id/encerrar` | Encerra vínculo ativo sem apagar histórico |

Exemplos:

```http
POST /api/propriedades
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{"nome":"Fazenda Experimental","municipio":"Patos de Minas","uf":"MG"}
```

```http
POST /api/animais
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{"identificacao":"A001","sexo":"femea","raca":"Nelore"}
```

Respostas: `{ "data": ... }`, para listagens `{ "data": [], "count": 0, "limit": 20, "offset": 0 }`; falhas em `{ "error": { "code": "...", "message": "..." } }`.

O corpo JSON é validado e campos como `propriedade_id` e `usuario_id` não são aceitos do cliente. A propriedade é determinada pelo usuário autenticado. Não existe operação de exclusão física de animais nesta versão.

## Observações

- Cadastros e ingestão MQTT de detecções estão implementados. A seção de ingestão abaixo descreve o worker e os testes.
- Não incluir chave `service_role` ou `sb_secret_...` no frontend ou nesse arquivo de exemplo.
- Integração ponta a ponta depende de um usuário Supabase Auth real e da chave publishable configurada; ainda não há credenciais de testes neste repositório.
- Banco remoto: `pqmdqtcjemgnjtugtuqy`; migrações em `supabase/migrations`.

## Dispositivos, zonas e vínculos (2ª etapa)

Todas as rotas abaixo exigem `Authorization: Bearer <access_token>`. A propriedade é sempre obtida do usuário autenticado, nunca do corpo enviado.

- `GET /api/dispositivos?tipo=transmissor&status=ativo&limit=20&offset=0`
- `GET /api/zonas?ativa=true&limit=20&offset=0`
- `GET /api/vinculos?ativo=true&animal_id=<uuid>&transmissor_id=<uuid>&limit=20&offset=0`

Respostas de listas seguem `{ data: [...], count, limit, offset }`. `GET /:id` retorna `{ data }` ou `404`, sem expor registros de outra propriedade.

### 1. Cadastrar transmissor e receptor

```http
POST /api/dispositivos
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN

{"codigo":"T01","tipo":"transmissor","nome":"Coleira 01"}
```

```http
POST /api/dispositivos
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN

{"codigo":"R01","tipo":"receptor","nome":"Receptor do Curral"}
```

Resultado: `201`; guarde os `id` retornados. `identificador_hardware` é opcional até o provisionamento. O `tipo` é imutável e **não** pode ser fornecido no PATCH. Campos `status` (`ativo`/`inativo`), `nome`, `codigo`, `identificador_hardware`, `versao_firmware` podem ser editados. Os horários de última comunicação ficam reservados à futura ingestão.

### 2. Cadastrar zona

```http
POST /api/zonas
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN

{"nome":"Curral 01","receptor_id":"UUID_DO_RECEPTOR","ativa":true}
```

Resultado: `201`. É possível criar uma zona sem receptor inicialmente, mas nesse caso fica inativa. Um receptor só pode estar atribuído a uma zona por vez. O banco rejeita receptor de outra propriedade ou transmissor usado como receptor.

Para desassociar o receptor de uma zona ativa, envie no mesmo PATCH `{ "ativa": false, "receptor_id": null }`.

### 3. Associar transmissor a animal

```http
POST /api/vinculos
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN

{"animal_id":"UUID_DO_ANIMAL","transmissor_id":"UUID_DO_TRANSMISSOR"}
```

Resultado: `201`; os campos `inicio_em` e `fim_em` são controlados pelo servidor/banco; `fim_em = null` indica vínculo ativo. Só animais e transmissores ativos da mesma propriedade podem iniciar vínculos.

Tente cadastrar novamente a mesma associação enquanto estiver ativa: esperado `409 Conflict`. A unicidade dos períodos de um animal e transmissor é garantida pelo PostgreSQL inclusive em condições concorrentes.

### 4. Encerrar e transferir

```http
PATCH /api/vinculos/UUID_DO_VINCULO/encerrar
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN

{}
```

Resultado: `200` com `fim_em` preenchido. Repita o encerramento: esperado `409`. Depois, utilize `POST /api/vinculos` para associar o transmissor a outro animal; o histórico permanece disponível via GET. O encerramento usa horário do servidor, com margem mínima de um segundo para não gerar período inválido quando o vínculo acabou de ser criado.

**Não há rotas de exclusão física nem de alteração arbitrária das datas históricas nesta versão.** Para detectar histórico e validar permissões, use duas contas com propriedades diferentes e tente consultar um UUID da outra propriedade (deve retornar `404`).

Esses testes de ponta a ponta são manuais via Postman: as verificações automáticas cobrem parsing de dados e autenticação HTTP sem token. Não são adicionados dados fictícios ao Supabase pelos testes automatizados.


## Ingestão MQTT (terceira etapa)

O worker é **um processo Node.js separado** da API Express. Ele valida o contrato MQTT e guarda a leitura em SQLite. Um sincronizador no mesmo processo valida o cadastro, resolve zona e vínculo e grava em `public.deteccoes`. O projeto Supabase já possui essa tabela, índices e `UNIQUE(receptor_id, evento_id)`: **não há migração nova nesta etapa**. A API HTTP não recebe `service_role` e o worker não é exposto no navegador.

### Contrato MQTT v1

**Tópico:**
```text
argos/v1/propriedades/<UUID_PROPRIEDADE>/receptores/<UUID_RECEPTOR>/deteccoes
```

**Payload JSON** (UTF-8, até 4096 bytes):
```json
{
  "versao": 1,
  "evento_id": "boot-001:000042",
  "transmissor_id": "UUID_DO_TRANSMISSOR",
  "rssi_dbm": -68,
  "bateria_percentual": 88,
  "detectado_em": "2026-11-11T10:30:00-03:00"
}
```

`transmissor_id` e `receptor_id` são os UUIDs do cadastro Argos; **não são MACs**. `bateria_percentual` é opcional (0–100); `detectado_em` é opcional, aceita ISO 8601 **com fuso horário** e fica `NULL` no banco quando o relógio do ESP32 não é confiável. `recebido_em` é registrado pelo PostgreSQL. O instante da primeira recepção no worker (preservado no SQLite) é usado para o vínculo quando `detectado_em` está ausente, sem fingir que o dispositivo mediu esse horário.

`evento_id` deve ser estável para **o mesmo evento** durante retransmissões: use identificador de boot persistente/único combinado com contador ou UUID por detecção; não gere um ID novo a cada tentativa de envio. É único por receptor, inclusive após reinícios. O broker deve fornecer **QoS 1**, e o consumidor usa sessão persistente com `MQTT_CLIENT_ID` estável. Mensagens retidas não são aceitas. Publicações duplicadas são ignoradas pelo banco.

### Pré-requisitos de provisionamento

1. Já deve existir uma propriedade, um dispositivo do tipo `receptor` ativo e um `transmissor` ativo **na mesma propriedade**, cadastrados via API. Guarde os UUIDs.
2. Para popular `zona_id`, mantenha uma zona **ativa** associada ao receptor.
3. Para popular `vinculo_id`, deve haver um vínculo válido para o transmissor no instante do evento.
4. Configure **no broker MQTT** autenticação individual por dispositivo e ACLs: cada receptor só publica seu tópico `argos/v1/propriedades/<sua_propriedade>/receptores/<seu_id>/deteccoes`; somente o worker assina os tópicos. MQTT **não** autentica usuários por JWT Supabase.
5. Use TLS (`mqtts://` ou `wss://`) em redes não locais. Configure certificados e credenciais confiáveis; não coloque segredos no firmware/repositório.

### Configurar o worker

No servidor, configure `backend/.env` (ignorado pelo Git). Além de `SUPABASE_URL` da API, o worker requer:

```dotenv
SUPABASE_SECRET_KEY=sb_secret_PREENCHER_NO_SERVIDOR
MQTT_URL=mqtts://broker.exemplo.com:8883
MQTT_CLIENT_ID=argos-ingest-01
MQTT_USERNAME=usuario_exclusivo_do_worker
MQTT_PASSWORD=SENHA_DO_BROKER
```

A chave `sb_secret_...` é uma chave privilegiada de **somente servidor**, obtida no painel Supabase; recomenda-se criar uma chave dedicada ao worker e restringir seu acesso operacional. **Nunca** copiá-la ao frontend, ao ESP32, ao Postman público ou à conversa. O processo Express continua utilizando somente `SUPABASE_PUBLISHABLE_KEY`.

Inicie o worker em terminal separado do Express:
```bash
pnpm --dir backend mqtt:worker
```

Broker local isolado, apenas para teste sem TLS:
```dotenv
MQTT_URL=mqtt://127.0.0.1:1883
MQTT_ALLOW_INSECURE_LOCAL=true
```
Este modo **não** permite HTTP/MQTT remoto sem TLS e não deve ser usado em produção.

### Testar manualmente (sem hardware físico)

Com broker MQTT de testes configurado, utilize um cliente como Mosquitto `mosquitto_pub` com credenciais de publicação de **um receptor de teste**. Substitua UUIDs e host pelos valores válidos:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -q 1 \
  -t "argos/v1/propriedades/UUID_PROPRIEDADE/receptores/UUID_RECEPTOR/deteccoes" \
  -m '{"versao":1,"evento_id":"teste-boot-001:1","transmissor_id":"UUID_TRANSMISSOR","rssi_dbm":-65,"bateria_percentual":80}'
```

Espere encontrar **um registro** em `public.deteccoes`, com `rssi_dbm=-65`, `recebido_em` preenchido, `detectado_em=NULL`; `zona_id` aponta para a zona ativa (se houver) e `vinculo_id` para o vínculo atual (se houver). Publique **o mesmo tópico e payload** novamente: a contagem não deve aumentar. Utilize `evento_id` diferente para uma nova leitura.

Casos negativos a verificar: RSSI fora de -127…0; identificadores inexistentes/externos; receptor inativo; versão diferente de 1; tópico de propriedade incorreta; pacote `retain` ou QoS 0. Nenhum deles deve criar detecção.

### Limitações importantes

- Esta etapa persiste **detecções brutas** e associa zona/vínculo; não calcula ainda a **zona corrente consolidada de cada animal** entre múltiplos receptores (deve aplicar deduplicação de animal e critério temporal/RSSI antes de contar o rebanho).
- Para leituras antigas (mais de 5 minutos), o worker preserva o vínculo histórico, quando compatível, mas não atribui a zona atual do receptor retroativamente: `zona_id = NULL` para evitar falsificar histórico quando houve reassociação de receptor. Um protocolo futuro poderá registrar histórico de zonas.
- Não há simulação de distância física por RSSI, nem pipeline GRU/alertas implementados.
- Erros permanentes de payload são descartados com log; falhas na escrita local dependem da retransmissão QoS 1 e falhas de acesso ao Supabase mantêm os eventos pendentes no SQLite. O provisionamento de broker/credenciais, testes end-to-end MQTT e testes com firmware real são **pendências**, não ações já realizadas.

## Demonstração de coleta offline

Use Node 22.13 ou posterior com `node:sqlite` disponível. Na raiz, execute `pnpm --dir backend mqtt:worker` com o arquivo de ambiente do backend já configurado. O notebook precisa alcançar o EMQX pela rede local e ter permissão de escrita em `backend/data/`. A coleta inicia mesmo se a internet estiver desligada. Para testar o modo offline, mantenha o Wi-Fi local e o broker ligados e desconecte apenas a saída para a internet.

1. Com internet, cadastre receptor e transmissor ativos, zona e vínculo. Publique uma leitura QoS 1 pelo ESP32 ou MQTTX e confira o contador de sincronizadas.
2. Sem internet, publique três leituras com IDs inéditos. Repita uma com o mesmo ID e conteúdo. O contador de pendentes deve subir em três.
3. Encerre e reinicie o worker. O terminal exibe as mesmas três pendências na inicialização.
4. Restabeleça a internet. Ao fim do envio, confira zero pendências, mais três sincronizadas e os três IDs na tabela `public.deteccoes`.

O arquivo padrão é `backend/data/deteccoes.sqlite`. O worker retém as leituras confirmadas e rejeitadas para inspeção e deduplicação durante a demonstração. Os contadores são acumulados por arquivo. Para usar outro arquivo, configure `MQTT_SQLITE_PATH` com um caminho absoluto em disco local. Mantenha o mesmo arquivo ao reiniciar. Cada ciclo envia até 50 pendências e o próximo começa três segundos após o término do anterior.

O PUBACK do worker ao EMQX vem após a gravação local. Uma indisponibilidade do Supabase mantém a pendência para nova tentativa. Quando o cadastro é inválido, a leitura fica registrada como rejeitada e o motivo aparece no terminal. O status dos dispositivos é conferido na sincronização. Para a apresentação, mantenha os cadastros estáveis e os relógios do notebook e dos dispositivos com hora confiável ajustados. A zona fica vazia se a leitura é antiga ou se a zona ativa foi alterada após o instante de referência, inclusive por uma edição de nome. O vínculo considera o intervalo histórico no instante da detecção ou, quando ausente, na primeira recepção local. No PostgreSQL, `recebido_em` continua indicando a chegada à nuvem.

Para repetir o teste de integração automatizado, use um broker **isolado** em loopback, sem autenticação e sem outros workers Argos. Defina `ARGOS_TEST_MQTT_URL` para sua URL local com porta e execute `pnpm --dir backend exec tsx --test tests/integracao/mqtt-offline.ts`. O teste inicia o worker real com SQLite temporário e uma API HTTP simulada, envia mensagens QoS 1 e interrompe o processo com pendências.

## Histórico de detecções

`GET /api/deteccoes` exige o token Bearer do usuário e retorna somente leituras da sua propriedade. Exemplo de consulta:

```http
GET /api/deteccoes?inicio=2026-11-12T00:00:00Z&fim=2026-11-13T00:00:00Z&limit=20&offset=0
Authorization: Bearer <access_token>
```

A resposta contém `data`, `count` (total filtrado), `limit` e `offset`. Cada item segue o tipo `DeteccaoHistorico` de `@argos/shared`. Os filtros opcionais `animal_id` e `zona_id` recebem UUIDs. O período inclui `inicio` e exclui `fim`, em ISO 8601 com fuso e até três casas de fração de segundo. Codifique `+` como `%2B` em offsets positivos. O limite padrão é 20 e o máximo é 100.

- `detectado_em` é o horário informado pelo ESP32, quando disponível.
- `recebido_no_gateway_em` é a primeira recepção pelo worker preservada na fila SQLite.
- `recebido_em` é a chegada ao PostgreSQL.
- `instante_referencia` usa a detecção ou, na ausência dela, a recepção pelo gateway. Leituras legadas sem ambos aparecem no fim da listagem geral e ficam fora dos filtros de período.
- O histórico vem em ordem decrescente de instante de referência, com desempate por recebimento na nuvem e ID. Animal e zona podem ser nulos. O animal é identificado pelo vínculo salvo na detecção. Os nomes exibidos vêm dos cadastros atuais.

Aplique a migração `20261112165455_argos_historico_deteccoes.sql` em instalações novas antes de atualizar o worker. O projeto Supabase da apresentação já recebeu a migração.

No ensaio em 12/11/2026, o relógio do notebook estava cerca de dois segundos atrás do banco. Para a apresentação, prepare zona e vínculo antes da primeira leitura e sincronize os relógios. Uma leitura com horário anterior ao cadastro pode vir sem associação.
