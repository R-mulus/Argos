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
