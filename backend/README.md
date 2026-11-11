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

- Cadastros de propriedade, animal, dispositivo, zona e vínculos estão implementados. Detecções, MQTT, dashboard, alertas e exportação permanecem para próximas entregas.
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

O worker é **um processo Node.js separado** da API Express. Ele assina mensagens de detecção, valida IDs e intervalos, resolve zona e vínculo no instante da leitura e grava em `public.deteccoes`. O projeto Supabase já possui essa tabela, índices e `UNIQUE(receptor_id, evento_id)`: **não há migração nova nesta etapa**. A API HTTP não recebe `service_role` e o worker não é exposto no navegador.

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

`transmissor_id` e `receptor_id` são os UUIDs do cadastro Argos; **não são MACs**. `bateria_percentual` é opcional (0–100); `detectado_em` é opcional, aceita ISO 8601 **com fuso horário** e fica `NULL` no banco quando o relógio do ESP32 não é confiável. `recebido_em` é registrado pelo PostgreSQL. O instante de recebimento é usado para o vínculo quando `detectado_em` está ausente, sem fingir que o dispositivo mediu esse horário.

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
- Erros permanentes de payload são descartados com log; erros de banco são tratados para retransmissão QoS1. O provisionamento de broker/credenciais, testes end-to-end MQTT e testes com firmware real são **pendências**, não ações já realizadas.
