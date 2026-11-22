# Integração ML ↔ backend/frontend

Atualizado em 22/11/2026 pelo lado do backend/frontend (Mateus), a partir da branch `backend-iot`
em `b65d487` (Larápio) e da `dev` local. Divisão de papéis conforme o prompt de ML:

| Responsável | Escopo |
|---|---|
| **Larápio** | `ml/` (trilateração, datasets, GRUs, inferência, classificação), funções SQL de KPIs do ML, testes e documentação do ML |
| **Mateus** | Backend Express, rotas, autenticação/RLS, migrations no fluxo da `dev`, frontend React e apresentação dos resultados |

Nada desta revisão alterou `ml/`, `worker/`, `broker/` ou a branch `backend-iot`.

## 1. O que foi verificado (22/11/2026)

| Item | Resultado |
|---|---|
| `ml/`: `python -m pytest -q` (Python 3.12, TensorFlow CPU 2.20) | 51 passaram (os 2 de GRU pulam sem TensorFlow) |
| `worker/`: `npm test` | 13 passaram |
| `backend/` da `backend-iot`: `typecheck` / `test` | passou / 25 |
| `backend/` da `dev` local: `typecheck` / `test` | passou / 30 |
| `frontend/` da `dev` local: `build` / `lint` | passou / passou |
| 15 migrations da `dev` + testes `supabase/testes/*.sql` em PostgreSQL 16 descartável | passaram (pg_cron simulado) |

**Ensaio físico registrado no Supabase (20/11, 23:22–23:40 UTC):** 490 leituras de RX-001/002/003 e uma
coleira; 462 com `detectado_em`, 462 com vínculo, **0 com zona**. `argos_iot_jobs`: 208 pendentes,
1 localizado, 1 com receptores insuficientes. `argos_localizacoes`: 2 linhas; `argos_predicoes`: 0.

## 2. Divergências para revisão conjunta

1. **Não mesclar `backend-iot` na `dev` como está.** Em relação à `origin/dev`, a branch apaga 37 arquivos,
   entre eles as 10 migrations de `supabase/migrations`, as seeds, `iot/`, `docs/iot/`, `AGENTS.md`,
   `ARGOS_CONTEXT.md`, `docker-compose.yml` e os workflows de CI (efeito do commit `be76a6c`). Proposta: PR
   que traga para a `dev` só os acréscimos (`ml/`, `worker/`, `broker/`, `docs/scrum/`, `shared/ml.ts`,
   scripts) e mantenha o restante.
2. **Migration aplicada fora do repositório.** `20261119154550_argos_resumo_horario_captura` está no
   Supabase hospedado, mas foi removida da `backend-iot` e nunca chegou à `dev`. Copiada do commit
   `456242e` para `supabase/migrations/` da `dev` (sem alteração de conteúdo).
3. **Zona sempre nula no `worker/`.** O `worker/README.md` justifica: `zonas` só guarda a associação
   atual. Consequência: o `resumo_monitoramento` não conta nenhum animal por zona. Aplicada em 22/11/2026:
   `20261122184335_argos_zona_historica_deteccoes.sql`, trigger no banco que atribui a zona apenas quando
   ela está ativa e **não foi alterada depois da captura** (`zonas.updated_at <= detectado_em`; todo update
   em `zonas` renova `updated_at`; um receptor tem no máximo uma zona). Sem horário, sem zona. Não muda o
   código de nenhum worker. Preenchimento opcional das 490 leituras:
   `supabase/manutencao/20261122_preencher_zona_historica.sql`. Teste: `supabase/testes/zona_historica.sql`.
   Se o Larápio não aceitar `updated_at` como prova, a alternativa é uma tabela de histórico receptor→zona.
4. **Dois ingestores e dois processadores.** `backend/src/mqtt` (dev) e `worker/` (backend-iot) gravam
   `deteccoes`; `iot/` (dev) e `ml/` (backend-iot) processam `argos_iot_jobs`. O README do ML pede para não
   rodar os dois processadores juntos. Definir um de cada. Se `worker/` for o oficial, faltam os avisos que
   o worker da dev grava em `alertas` (`sincronizacao_concluida`, `deteccao_rejeitada`), usados pela
   central de avisos.
5. **KPIs.** O prompt pede KPIs em funções/views PostgreSQL (Sprint 7, Larápio). Hoje a `backend-iot` tem
   `GET /api/iot/analise`, que executa `python -m argos_ml.bridge` a cada requisição (`kpis.py`). Isso
   faz a API depender de Python e duplica a camada que a Sprint 7 vai criar. A `dev` **não** incorporou
   essa rota; o backend vai consumir as funções SQL quando existirem (seção 4).
6. **Rótulos de comportamento.** `argos_observacoes_visao` não tem SELECT para `authenticated`. A distribuição
   de comportamento observado precisa vir de função SQL `security invoker` com política por propriedade,
   ou de função revisada que filtre a propriedade do usuário e devolva só agregados.
7. **Métricas do modelo.** `modelMetrics` lê `manifest.json` do disco do servidor da API
   (`ARGOS_MODEL_DIR`). Sugestão: o ML grava os campos públicos de `ModeloML` numa tabela
   (ex.: `argos_modelos`, uma linha por propriedade/tarefa/versão) com RLS de leitura, e a API só consulta.
8. **Previsões sem comportamento.** `ml/sql/proposta_predicao_posicao.sql` virou
   `20261122184338_argos_predicoes_sem_comportamento.sql` na `dev`, aplicada em 22/11/2026. `PredicaoIoT` em
   `@argos/shared` passou a aceitar `comportamento`, `confianca` e `probabilidades` nulos.
9. **Firmware.** As duas branches alteraram `firmware/ArgosReceptor/ArgosReceptor.ino`: a `dev` local
   (horário recuperado após NTP, diagnóstico no Serial, canal divergente sem travar) e a `backend-iot`
   (`ArgosNetworkClient.h`, tratamento do erro MQTT -2). Exige merge manual.
10. **Geometria da GRU.** A verificação de geometria feita em `iot/` (19/11) fica obsoleta se `ml/`
    substituir `iot/`: o `ml/` já recusa inferência com referencial incompatível.

## 3. O que o backend já fornece e o frontend já consome

| Rota (JWT, propriedade da sessão, RLS) | Fonte | Uso |
|---|---|---|
| `GET /api/monitoramento/resumo` | `resumo_monitoramento` | Contagem por zona (depende da seção 2.3) |
| `GET /api/iot/localizacoes/recentes` | view `argos_localizacoes_recentes` | Mapa (até 5 estimativas por animal) |
| `GET /api/iot/localizacoes`, `GET /api/iot/predicoes` | tabelas `argos_*` | Histórico RSSI e previsões |
| `GET/PUT /api/iot/receptores/coordenadas`, `/api/iot/referencia-espacial`, `/api/iot/zonas/*` | tabelas `argos_*` | Calibração, referência e contornos |

Cards dependentes do modelo (comportamento, análises do modelo) continuam com selo "Simulado" nas telas
reais. Sem previsão persistida, a tela mostra ausência.

## 4. Contrato pedido à Sprint 7 (Larápio)

Para o backend consumir sem lógica própria (`auth.db.rpc(...)` com o JWT do usuário):

- Funções `security invoker`, `set search_path = ''`, `execute` só para `authenticated`; propriedade
  validada pela RLS das tabelas lidas (nunca recebida do navegador sem checagem).
- Sugestão de assinatura: `argos_kpi_movimentacao(p_animal uuid, p_inicio timestamptz, p_fim timestamptz,
  p_periodo text) returns jsonb` no formato `AnaliseML` de `shared/ml.ts`, e
  `argos_kpi_comportamentos(p_animal uuid, p_inicio timestamptz, p_fim timestamptz) returns jsonb` no
  formato `ComportamentosML`. Nomes finais ficam a critério do Larápio.
- Cada valor com origem explícita (`observado` | `estimado` | `previsto` | `indisponivel`), cobertura
  temporal e `null` quando faltar dado, como já fazem os tipos de `shared/ml.ts`.
- Testes SQL no padrão de `supabase/testes/` (transação com `rollback`), rodando sobre as migrations da `dev`.

Com isso, o backend expõe uma rota fina (ex.: `GET /api/iot/animais/:id/analise`) e o frontend troca os
dados simulados dos cards pela resposta, mantendo os estados vazio/indisponível.

## 5. Próximos passos

| # | Ação | Responsável | Depende de |
|---|---|---|---|
| 1 | Decidir ingestor (`worker/` ou `backend/src/mqtt`) e processador (`ml/` ou `iot/`) | Larápio + Mateus | — |
| 2 | Confirmar a regra de zona histórica (aplicada) e decidir o preenchimento das leituras antigas | Larápio + Mateus | — |
| 3 | ~~Aplicar `20261122184335` e `20261122184338` no Supabase~~ feito em 22/11 | Mateus | — |
| 4 | PR seletivo `backend-iot` → `dev` sem apagar migrations/CI/docs | Larápio | 1 |
| 5 | Validar coordenadas/calibração reais e habilitar escrita de localização | Larápio | campo |
| 6 | Funções SQL de KPIs (Sprint 7) e contrato da seção 4 | Larápio | 4 |
| 7 | Rota da análise e cards do frontend sobre as funções SQL | Mateus | 6 |
| 8 | Tabela de métricas públicas do modelo e tela de métricas | Larápio (dados) / Mateus (tela) | modelo treinado |
