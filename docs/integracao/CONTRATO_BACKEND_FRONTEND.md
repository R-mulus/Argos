# Contrato backend → frontend — Argos acadêmico

23/11/2026, branch `backend-iot`. Nenhuma alteração React. Consumidor pode estar na dev;
não precisa executar MQTT, Python, TensorFlow ou conhecer a arquitetura da GRU.

## Autenticação e execução

API Express: `pnpm --filter @argos/backend start`, porta configurada por PORT (padrão 3333).
Todas as rotas abaixo usam `Authorization: Bearer <access_token Supabase Auth>`.
Backend valida token com `auth.getUser`, determina propriedade do usuário e usa o mesmo JWT
nas consultas ao PostgreSQL. Não aceita propriedade arbitrária do cliente nem usa service role.
`GET /api/health` é público. CORS_ORIGIN deve incluir a origem real do frontend.

## Rotas existentes reutilizadas

| Rota GET | Parâmetros | Resposta |
|---|---|---|
| `/api/iot/analise` | animal_id UUID, inicio/fim ISO com fuso, periodo=dia/semana/mes | `{data: PainelML}` |
| `/api/iot/localizacoes` | animal_id opcional, inicio/fim opcionais, limit/offset | `{data: LocalizacaoML[], count, limit, offset, consultado_em}` |
| `/api/iot/predicoes` | mesmos filtros de histórico | `{data: PredicaoML[], count, limit, offset, consultado_em}` |
| `/api/iot/receptores/coordenadas` | limit/offset | calibração e geometria cadastradas da propriedade |

Histórico ordenado do mais recente para o mais antigo, filtro `[inicio,fim)`. Usar paginação
para exportar todo o histórico, respeitando os limites existentes da API. A análise permite
intervalos positivos de até 31 dias; `periodo` só determina tamanho do bucket, não substitui datas.
Não foram criados endpoints duplicados. Modelos estão em `PainelML.modelos`, lidos de
`argos_modelos_ml`, sem consultar arquivos do processador.

## RPC e tipos

`public.argos_ml_analise(p_animal_id uuid,p_inicio timestamptz,p_fim timestamptz,p_periodo text)`
retorna jsonb. `SECURITY INVOKER`, RLS e schema/search_path explícitos. EXECUTE para authenticated.
O backend valida o JSON SQL antes de responder; não calcula distância, comportamento ou KPIs.
Tipos compartilhados em `shared/ml.ts`: AnaliseML, ComportamentosML, PainelML, LocalizacaoML,
PredicaoML e ModeloML. Adições opcionais preservam campos anteriores:

- Localizações/previsões: origem, referencial_versao, calibracao_sha256.
- Modelos: approval_status, origem, referencial_versao, atualizado_em.
- Painel: qualidade, resumo_previsoes, previsoes_total, previsoes_truncadas, ultima_observacao_em.

`PainelML.previsoes` continua sendo array. O objeto `previsoes` da RPC vira `resumo_previsoes`;
não substituir o array por esse resumo. `historico` contém as últimas 500 localizações do período
em ordem cronológica; `previsoes`, as últimas 100. Totais e flags de truncamento são explícitos.
KPIs SQL consideram o período completo, não somente essa amostra visual; não há limite de
10 mil leituras imposto pela API de análise. Contagens são feitas pelo PostgreSQL.

## Mapeamento pronto para consumo

| Indicador | Campo de PainelML | Unidade/semântica |
|---|---|---|
| Distância estimada | resumo.distancia_estimada_m | metros; null sem cobertura |
| Velocidade média | resumo.velocidade_media_estimada_m_s | m/s em tempo coberto |
| Velocidade máxima | qualidade.velocidade_maxima_estimada_m_s | m/s, segmento aceito |
| Cobertura | resumo.cobertura_percentual | 0–100 do período |
| RMS | resumo.rms_medio_m | resíduo em metros, não precisão física |
| Localizações válidas | resumo.localizacoes | amostras aceitas pelos filtros SQL |
| Movimento/repouso aparente | resumo.segundos_movimento_aparente / segundos_repouso_aparente | segundos; null indisponível |
| Tempo indeterminado observado | qualidade.segundos_indeterminados_observados | segundos cobertos sem classificação aparente |
| Sem observação | qualidade.segundos_sem_cobertura | segundos, nunca repouso |
| Série temporal | movimentacao.pontos | buckets UTC horários ou diários |
| Comportamentos observados | comportamentos | somente rótulos revisados, com cobertura |
| Posição | historico / endpoint localizacoes | X/Y em metros no referencial local |
| Previsão | previsoes / endpoint predicoes | X/Y e previsto_para, não observação |
| Última observação no período | ultima_observacao_em | ISO com fuso; null quando ausente |
| Modelo | modelos | versões registradas, métricas e escopo de aprovação |

O campo origem do painel é conservador: real somente se todas as origens conhecidas forem
reais; synthetic se somente sintéticas; demais casos experimental. Qualidade e registros
individuais preservam origens distintas. Referencial é único quando possível; em mistura/ausência,
`indisponivel-ou-multiplos`. Não ligar pontos de referenciais distintos no mapa.
`avisos` identifica histórico desatualizado (>5 min) e indisponibilidade opcional de metadados.
`consultado_em` é horário da consulta, não da medição. Modelo registrado não significa worker ativo.

## Nulos, estados e exemplos

Sem rótulos confiáveis: comportamentos.disponivel=false e os quatro percentuais são null.
Não apresentar quatro fatias de 25%, nem usar `outro` como substituto. Probabilidades futuras
não são percentuais de tempo observado. Previsão de posição válida pode conter:

```json
{
  "origem": "experimental",
  "referencial_versao": "curral-demo-v1",
  "observado_em": "2026-11-23T12:00:00Z",
  "previsto_para": "2026-11-23T12:05:00Z",
  "proximo_x_m": 4.1,
  "proximo_y_m": 6.2,
  "comportamento": null,
  "confianca": null,
  "probabilidades": null,
  "modelo_versao": "posicao-demo-v1"
}
```

Exemplo parcial de contrato, não resultado físico. Exemplo SQL vazio completo e validado pelos
testes: `supabase/testes/exemplo-vazio.json`. Sem histórico, arrays são vazios, distância/velocidade
são null e cobertura é 0. Não há preenchimento fictício quando falha o banco.

Modelo acadêmico: `approval_status=demo_approved`, `approved=false`, `origem=experimental`.
`approved=true` continua significando produção. Modelo avaliado que não superou baseline
pode demonstrar previsões, sem alegação de melhoria ou precisão física certificada.

## Erros

Formato `{error:{code,message}}`. Tratar como indisponibilidade quando apropriado:

| HTTP | Código | Significado |
|---|---|---|
| 400 | BAD_REQUEST | parâmetros inválidos |
| 401 | UNAUTHORIZED | token ausente/inválido |
| 403 | FORBIDDEN / ML_SQL_UNAVAILABLE | RLS/escopo negado |
| 404 | BAD_REQUEST | animal não encontrado na propriedade, sem revelar outro proprietário |
| 409 | PROPERTY_REQUIRED | usuário ainda sem propriedade |
| 503 | ML_SQL_UNAVAILABLE | RPC ausente/falhou |
| 503 | ML_SQL_CONTRACT | JSON SQL incompatível |
| 503 | ML_DATABASE_UNAVAILABLE / IOT_DATABASE_UNAVAILABLE | consulta ao banco indisponível |

A ausência apenas da tabela opcional de modelos retorna modelos=[] e aviso explícito, mantendo
o histórico. Ausência da RPC não é disfarçada com cálculo Python. Localizações e previsões podem
ser consultadas independentemente por suas rotas existentes enquanto a RPC é implantada.

## Implantação e evidências

Requer as migrations de proveniência, KPIs e modelos. São propostas revisáveis; não foram
aplicadas ao Supabase operacional. Ver guia `docs/operacao/EXECUTAR_MVP.md`.
Testes HTTP executam Express e Supabase HTTP simulado, validam Bearer, escopo, JSON, nulos,
RPC ausente/incompatível e banco indisponível, sem Python/MQTT em execução.
Testes PostgreSQL isolado exercitam RLS real entre dois papéis de usuário e metadados/previsões
de uma GRU treinada em fixture acadêmica. Auth/JWT real, browser e rádio físico ficam para staging.
O frontend não foi alterado nem compilado nesta tarefa.
