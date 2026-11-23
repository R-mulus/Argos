# Sprints e evidências

## Atualização de 22/11/2026 — entrega Larápio

S7 implementada em SQL e validada isoladamente; S3–S6 validadas tecnicamente com fixtures,
sem aprovação de campo. Estado detalhado, arquivos, critérios, pendências e próximos passos em
[ENTREGA_ML_SQL.md](ENTREGA_ML_SQL.md). Registros abaixo são históricos e não foram apagados.

## S0 — auditoria (concluída)

Entrega: inventário e baseline de 45 testes aprovados, Python 3.12/TensorFlow CPU. `backend-iot` contém `ml` ainda não versionado; `origin/dev` contém aplicação Express/React. Importação seletiva dos pacotes de aplicação será commit separado, sem alterar a branch dev, firmware ou broker.

Prontos: trilateração robusta; agrupamento; diagnóstico sem escrita; vínculo temporal; GRUs pequenas; splits cronológicos; outbox SQLite; KPIs Python. Parcial: origem de datasets, ativação administrativa, observabilidade, integração visual. Ausente nesta branch: servidor da aplicação e frontend de dev.

Divergência: o prompt cita BLE; a ingestão inspecionada usa ESP-NOW/HMAC. Nenhuma mudança de protocolo. O resíduo não comprova posição real.

## S1 — localização (concluída tecnicamente)

Entrega existente consolidada: diagnóstico percorre pendentes, conta receptores distintos calibrados e reutiliza `localize`. Rejeita eventos misturados, RSSI inválido, geometria degenerada e horários incompatíveis. Sem relógio, apenas posição numérica sem animal/tempo. Evidência anterior: 208 jobs, 101 cálculos, zero gravações; números são fotografia histórica.

Risco: geometria genérica e calibração provisória. Validação física permanece pendente. Próxima: proteção explícita de escrita e controle de execução (S2).

## S2–S10

Em desenvolvimento. Cada conclusão exige testes e evidência no relatório; a prontidão operacional não será inferida dos testes sintéticos.

### S2 — concluída tecnicamente, operação em um host

História: impedir gravação experimental e recuperar falhas. Entrega: guarda de origem real/validação administrativa/hash/referencial, lock de propriedade liberado pelo SO, métricas por ciclo (resultados/latência/outbox), ACK e upsert existentes preservados. Outbox tenta outros registros após falha individual.

Evidência: 23 testes de proveniência, banco e diagnóstico aprovados. Arquivos: `provenance.py`, `worker.py`, `.env.example`, CLI `reference`, testes e README. Risco: não suporta workers concorrentes em hosts diferentes; exige mesmo diretório de locks. Nenhuma escrita real habilitada. Próxima: origem e integridade de datasets (S3).

### S3/S4/S5 — consolidação implementada, validação em andamento

Dataset v2 canônico com SHA256, origem e snapshot/referencial; exportação experimental exclusivamente local.
GRU reutilizada com seed 42, CPU e operações determinísticas; manifesto v2 inclui origem/referencial/hiperparâmetros.
Inferência exige referencial compatível; aprovação experimental e dataset real legado sem manifesto são bloqueados.
Hash do modelo e do teste reservado verificados na reavaliação/aprovação. Outbox existente preserva previsões
se o schema remoto ainda rejeitar campos nulos. Migration permanece proposta, sem aplicação.
