# API Argos — primeira entrega

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

- Somente cadastros de propriedade e animal foram implementados. Dispositivos, vínculos, detecções, MQTT, dashboard, alertas e exportação permanecem para próximas entregas.
- Não incluir chave `service_role` ou `sb_secret_...` no frontend ou nesse arquivo de exemplo.
- Integração ponta a ponta depende de um usuário Supabase Auth real e da chave publishable configurada; ainda não há credenciais de testes neste repositório.
- Banco remoto: `pqmdqtcjemgnjtugtuqy`; migrações em `supabase/migrations`.
