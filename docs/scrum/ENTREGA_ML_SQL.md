# Entrega por sprint — Larápio

Data: 22/11/2026, America/Sao_Paulo. Desenvolvimento em `backend-iot`, worktree separado.
Sem merge, push, gravação experimental ou DDL em produção. O checkout pendente do integrador
em `integracao/ml-backend-iot` foi preservado. `dev` não foi modificada.

## Sprint 7 — KPIs SQL (implementação e testes isolados concluídos)

Objetivo: desbloquear o consumidor SQL sem executar ML em requisições.
Implementação: duas migrations propostas, RPC com assinatura acordada como proposta,
RLS/invoker, proveniência opcional sem backfill, nulabilidade de comportamento,
distância/cobertura/qualidade, distribuição observada e resumo de previsões.
Arquivos: `supabase/migrations/*_argos_ml_*.sql`, `supabase/testes/`,
`ml/docs/CONTRATO_SQL.md`. Migrations anteriores foram copiadas sem edição de origin/dev.
Testes: 8 casos PostgreSQL WASM/PGlite, com múltiplas asserções, incluindo duas propriedades,
anon, períodos, JSON completo, lacunas, vínculos, referências, rótulos e posição sem comportamento.
Aceite técnico local atingido; produção/staging PostgREST ainda pendentes.
Próximo passo: integrador revisar extensões JSON e rollout, responsável autorizar migrations.

## Sprint 3 — datasets (validação técnica isolada concluída)

Reforçados SHA256 de calibração, origem real por amostra, referência compatível e revisão de
rótulos reais. Dataset experimental pode ser exportado localmente sem mutar jobs ou dados;
não recebe aprovação operacional. CLI infer também verifica integridade do dataset.
Arquivos: `datasets.py`, `cli.py`, testes de datasets/continuação. Testes existentes verificam
splits cronológicos antes das janelas, gaps, separação de identidades e scalers só no treino.
Exportação experimental foi testada com repositório simulado, não com dados de produção.
Próximo passo: coletar dados físicos com proveniência por amostra.

## Sprint 4 — GRU de posição (validação técnica isolada concluída)

Arquitetura existente reutilizada. Treino CPU de 2 épocas em fixtures, serialização .keras,
MAE/RMSE, baseline, scalers, hash, load/infer e reavaliação exercitados.
Adicionados casos dataset v2 experimental além do sintético; ambos bloqueados para aprovação.
Arquivos: `tests/test_gru.py`. Testes alteram manifesto somente em diretório temporário para
exercitar carregamento aprovado, restaurando-o imediatamente; não promovem artefato operacional.
Nenhum MAE sintético é apresentado como precisão física. Próximo: ground truth e revisão de campo.

## Sprint 5 — inferência (validação técnica isolada concluída)

Localizações e previsões novas carregam versão/hash/origem. Inferência rejeita histórico sem
proveniência ou incompatível. Teste demonstra que falha de um modelo preserva localização e
permite outro modelo gerar previsão para outbox. Testes existentes cobrem restart, retry,
idempotência e ACK condicional. Arquivos: `worker.py`, `inference.py`, testes.
Persistência de posição com comportamento nulo foi testada no PostgreSQL isolado.
Pendência: migration aprovada antes de habilitar escrita e ensaio contínuo em staging.

## Sprint 6 — comportamento (implementação e validação sintética concluídas)

Segunda GRU independente, quatro classes, probabilidades, matriz de confusão e métricas
precision/recall/F1 já implementadas e exercitadas por treino/load/reavaliação.
Fonte de rótulos real agora exige revisão. Sem rótulos, só movimento aparente/indeterminado;
alimentação nunca é inferida por proximidade. Próximo: rótulos reais revisados e validação externa.

## IoT e firmware — compatibilidade implementada, aceite físico pendente

`worker/` ganhou outbox de avisos de rejeição e recuperação por propriedade. Estado e aviso
são gravados na mesma transação SQLite, inclusive ao concluir/rejeitar eventos. Após reinício
ou confirmação remota perdida, retry usa `propriedade_id,origem_evento` para deduplicar alertas.
16 testes Node passaram; build TypeScript passou.

Receptor mantém formato da flash, ESP-NOW, HMAC e PUBACK. Guarda em RAM o instante monotônico
das últimas 64 leituras inéditas; após NTP no mesmo boot, pode recuperar até 5 minutos anteriores.
Não recupera flash prévia ao boot, arquivos já existentes, entradas expulsas do cache nem
horários além da janela. Após perda de Wi-Fi o relógio já sincronizado conserva a regra de 24 h
existente. Retentativas no mesmo boot reutilizam o horário recuperado. Não regrava a flash.
Testes nativos de recuperação, HMAC e fila passaram. Compilações ESP32 TCP, ESP32-C3 TCP e
ESP32 TLS passaram. Não houve upload nem teste de rádio/reconexão em hardware nesta entrega.

## Desacoplamento e limites do aceite

- A/F: ensaio RSSI Python → localização persistida → RPC após terminar Python, sem MQTT/ESP32.
- B: consulta de previsões/localizações não carrega TensorFlow; falha de IA é isolada no worker.
- C: falhas de rede são testadas no repositório ML/ingestor; apresentação HTTP/React fica com integrador.
- D: previsão com três campos de comportamento nulos persistida/consultada no PostgreSQL isolado.
- E: papéis authenticated de duas propriedades submetidos a RLS; Auth/JWT real fica para staging.

Isso não equivale a um ensaio único ESP32 físico → broker → ML treinado → browser.
Sprints 8/9/10 continuam com gates de integração/staging/campo. Nenhuma alternativa foi removida.

## Decisão arquitetural e handoff

Oficiais: `worker/` ingere; `ml/` processa. `backend/src/mqtt` e `iot/` ficam preservados como
alternativas, sem execução simultânea. Locks existentes protegem uma fila/diretório local;
não bloqueiam implementações antigas em outro host. O rollout deve listar e parar explicitamente
os consumidores alternativos antes de iniciar os oficiais. Não há promessa de exclusão distribuída.

Contratos de central preservados: `deteccao_rejeitada` (receptor:evento) e
`sincronizacao_concluida` (sincronizacao:UUID), prioridade, título, descrição e escopo.
Payloads MQTT malformados sem identidade confiável permanecem apenas no log; não criam alertas
em uma propriedade arbitrária. Avisos sem propriedade/receptor válido são descartados após checagem.
Backlog anterior à atualização não é inventariado retroativamente como uma interrupção; entrará
em recuperação quando houver nova falha/retry. Rejeições antigas não ganham avisos fabricados.

Zona provisória: worker mantém zona_id nulo e depende do trigger de integração; a versão do
trigger aplicada em produção não foi consultada nem modificada. Não há histórico completo
receptor→zona. Eventos antigos sem evidência devem continuar sem associação.

Integração deve revisar: campos de proveniência nos tipos (aditivos), nome do resumo de previsões
para não colidir com o array de PainelML, erros SQL controlados, estado desatualizado e métricas
de modelos persistidas no banco em vez de leitura do disco local do processador.
