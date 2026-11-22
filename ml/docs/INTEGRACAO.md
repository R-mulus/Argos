# Contrato para o colaborador do backend/frontend

Não foi criado um segundo servidor HTTP. `contracts/iot.ts` define dados e
`argos_ml/queries.py`/`kpis.py` implementam consultas/agregações de referência.
O backend Express em dev deve usar o cliente Supabase do **usuário autenticado** e
`requirePropriedade(auth)` antes de consultar/agregar. Nunca aceitar propriedade arbitrária
do navegador nem expor `SUPABASE_SECRET_KEY`. Se portar os agregadores para Node, use
as fixtures/testes Python como contrato e faça paginação de todos os resultados do intervalo.

## Rotas existentes, reutilizadas

- `GET /api/iot/localizacoes?animal_id=UUID&limit=...&offset=...`: `Location[]` no envelope
  `{data,count,limit,offset,consultado_em}`. Posição atual = última observada, nunca predição futura.
- `GET /api/iot/predicoes?animal_id=UUID`: mesmo envelope com `Prediction[]`.
  Campos de tempo já existem no banco real. Exibir horizonte por `previsto_para - observado_em`.
  Após revisão da proposta SQL, tratar comportamento/confiança/probabilidades nulos.
- `GET/PUT /api/iot/receptores/coordenadas`: contrato existente de calibração.
- `GET /api/monitoramento/resumo` e `/api/monitoramento/receptores`: não duplicar estes recursos.

## Extensões propostas (não registradas nesta branch)

| Rota | Implementação de referência | Retorno |
|---|---|---|
| `GET /api/iot/animais/:id/movimentacao?inicio=&fim=&periodo=dia` | `summarize_movement` | `Movement` |
| `GET /api/iot/habitos?animal_id=&inicio=&fim=` | `behavior_distribution` | `BehaviorDistribution` |
| `GET /api/iot/modelo/metricas` | manifesto público por propriedade | `ModelMetrics` |

Para animal em destaque, `animal_report` fornece cadastro, idade em dias no fim do período,
última pesagem com data, distância, tempo em movimento aparente e cobertura.
Para receptores, `receivers_report` fornece detecções recentes/24h e RSSI médio de beacon.
Os relatórios podem enriquecer as rotas existentes; não é obrigatório criar uma rota para cada card.
Todas as séries usam timestamps ISO UTC. Dia: buckets horários; semana/mês: diários.
Validar `inicio < fim` e limitar intervalo consultado na API (por exemplo 31 dias por chamada).

`argos_observacoes_visao` é interna, sem SELECT para usuários. Não habilitar acesso global
para implementar hábitos. Se o backend usar cliente administrativo para rótulos, primeiro resolver
propriedade pelo usuário e restringir consulta por propriedade/animal; retornar somente agregados.
Alternativamente portar a agregação para um recurso específico com RLS revisada pelo responsável.

## Semântica para os cards

- `probabilidades` é distribuição das classes **previstas no instante futuro**, soma 1.
  Multiplicar por 100 apenas para apresentação. Não é percentual de tempo em alimentação.
- `percentuais` é distribuição temporal observada, soma 100 quando disponível; sempre mostrar cobertura.
- `movimento_aparente` tem categorias próprias e não alimenta silenciosamente os quatro comportamentos.
- Sem dados, retornar campos nulos/`disponivel=false`. Não usar distribuição uniforme 25/25/25/25.
- `parado` não equivale automaticamente a `descanso`. Propor rótulo visual **Parado**.
- `comendo` pode aparecer como **Alimentação**, quando o rótulo/modelo tiver essa definição validada.
- `em_movimento` → **Movimento**; `outro` → **Outro**, nunca **Agrupamento**.
- Agrupamento/coerência de rebanho exigem múltiplos animais sincronizados e geometria comum; indisponíveis.
- Não retornar `status=normal` só porque há dados; normalidade exige critério de produto validado.
- `erro_residual_m` é qualidade de ajuste, não porcentagem de precisão real.
- Peso, idade, temperatura, perdas, bateria do receptor e precisão não disponíveis devem aparecer como “—”.

No componente `DistribuicaoComportamento` da revisão auditada, remover fallback automático de
dados simulados ao conectar a API e acrescentar estados sem dados/cobertura. Alteração fica com
o colaborador; não foi aplicada aqui. `MediaMovimentacao` já suporta ausência de pontos: preservar
lacunas em vez de conectar intervalos sem coleta.

## Métricas e proteção dos artefatos

Expor só os campos do tipo `ModelMetrics`, não o manifesto interno completo (contém normalizadores,
identificadores e caminhos conceituais de treinamento). Modelos são por propriedade/referencial.
Regressão: MAE/RMSE em metros. Classificação: acurácia, matriz de confusão e métricas por classe.
`inference_time_ms` no treino é média por amostra de lote de teste; no preditor é última chamada,
não benchmark ONNX/GPU. Não usar 97%, FLOPs ou números de demonstração do mockup.

Sem modelo aprovado, contrato inicial pode ser:
```json
{"model_version":"gru-v1","approved":false,"training_samples":0,"prediction_horizon_minutes":5,"evaluation":null}
```

## Persistência e rollout

1. Conferir coordenadas e calibração real; rodar `worker --once` sem escrita.
2. Habilitar somente localização; verificar amostras em campo e vínculo histórico.
3. Revisar/aplicar, pelo fluxo de migrations do colaborador, a proposta para NULL em predição de posição.
4. Integrar campos nulos no backend/frontend antes de aprovar modelo de regressão.
5. Coletar histórico, revisar origem, treinar, comparar baseline e validar em campo.
6. Aprovar versão e configurar worker. Não executar junto do worker Python legado em dev.

Sem a etapa 3, previsões de posição ficam preservadas na outbox local. A ingestão MQTT e a
localização não dependem dessa alteração. Nenhum DDL é executado automaticamente.
