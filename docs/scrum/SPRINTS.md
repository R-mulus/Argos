# Sprints e evidências

## S0 — auditoria (concluída)

Entrega: inventário e baseline de 45 testes aprovados, Python 3.12/TensorFlow CPU. `backend-iot` contém `ml` ainda não versionado; `origin/dev` contém aplicação Express/React. Importação seletiva dos pacotes de aplicação será commit separado, sem alterar a branch dev, firmware ou broker.

Prontos: trilateração robusta; agrupamento; diagnóstico sem escrita; vínculo temporal; GRUs pequenas; splits cronológicos; outbox SQLite; KPIs Python. Parcial: origem de datasets, ativação administrativa, observabilidade, integração visual. Ausente nesta branch: servidor da aplicação e frontend de dev.

Divergência: o prompt cita BLE; a ingestão inspecionada usa ESP-NOW/HMAC. Nenhuma mudança de protocolo. O resíduo não comprova posição real.

## S1 — localização (concluída tecnicamente)

Entrega existente consolidada: diagnóstico percorre pendentes, conta receptores distintos calibrados e reutiliza `localize`. Rejeita eventos misturados, RSSI inválido, geometria degenerada e horários incompatíveis. Sem relógio, apenas posição numérica sem animal/tempo. Evidência anterior: 208 jobs, 101 cálculos, zero gravações; números são fotografia histórica.

Risco: geometria genérica e calibração provisória. Validação física permanece pendente. Próxima: proteção explícita de escrita e controle de execução (S2).

## S2–S10

Em desenvolvimento. Cada conclusão exige testes e evidência no relatório; a prontidão operacional não será inferida dos testes sintéticos.
