# Critérios de aceite e Definition of Done

## Aceite MVP acadêmico — 23/11/2026

- [x] Modo acadêmico explícito preserva idempotência, escopo, horário, algoritmo e origem experimental.
- [x] Aprovação demo separada de produção; hash, avaliação, scalers, carga e inferência verificados.
- [x] Previsão experimental persiste sem comportamento em PostgreSQL isolado.
- [x] API autentica e consome SQL/histórico sem executar ML ou ler artefatos locais.
- [x] RLS, erros controlados, contratos, coleta monitorável e comandos de operação documentados.
- [ ] Migrations autorizadas/aplicadas ao ambiente da demonstração.
- [ ] Coleta física de 24 h e treino com essas posições, sem confundir com fixtures.
- [ ] Versão treinada com a coleta aprovada e ativada para demonstração.
- [ ] NTP, rádio, MQTT e consumo pelo frontend validados fisicamente/em staging.

Revisão 22/11/2026: S3–S7 atendem ao aceite técnico isolado descrito na
[entrega](ENTREGA_ML_SQL.md). Não encerra DoD integral de staging/produção/integração visual.
Novos gates: revisão das duas migrations, RLS via JWT/PostgREST, contratos aditivos, ensaio de
NTP físico, avisos na central e garantia operacional de um ingestor/processador por propriedade.
Checklist abaixo preservado como registro da auditoria inicial.

Cada sprint exige código revisável, testes aprovados, comandos documentados, contratos válidos e riscos explícitos. Teste de fixture não equivale a validação científica ou operacional.

- [x] S0: inventário e baseline executados.
- [x] S1: cálculo e rejeições testados, diagnóstico sem mutação.
- [ ] S2: escrita depende de calibração validada; exclusão mútua, retries, idempotência e métricas testados.
- [ ] S3: dataset com origem/referencial/hash, sem mistura e sem vazamento temporal.
- [ ] S4: treino/load/inferência, baseline e integridade testados; aprovação experimental bloqueada.
- [ ] S5: outbox recuperável e inferência independente da localização.
- [ ] S6: heurísticas conservadoras e classificador testado com sintéticos identificados.
- [ ] S7: KPIs cobertos e null onde indisponível.
- [ ] S8: API autenticada, painel integrado e build aprovado.
- [ ] S9: testes isolados integrados e observabilidade documentada.
- [ ] S10: instalação e operação reproduzíveis, pendências separadas.

Aceite de produção, separado e pendente: calibração medida, referencial estável, ground truth, rótulos revisados, aprovação responsável dos modelos, migration autorizada, ensaio real de RLS/autenticação e operação contínua.
