# Relatório de testes por sprint

## Continuação ML/SQL — 22/11/2026

- `cd ml; python -m pytest tests -q`: 56 passaram, 28 avisos de depreciação Keras/NumPy,
  11,31 s. Python 3.12/TensorFlow 2.20 CPU; quatro treinos de duas épocas em fixtures v2.
- `node --test supabase/testes/ml.test.mjs` com ARGOS_TEST_PYTHON: 8 passaram,
  PostgreSQL WASM/PGlite 0.5.17, sem conexão externa; RLS, contrato completo e ensaio RSSI→SQL.
- `npm --prefix worker run build` e `npm --prefix worker test`: build OK, 16 testes passaram.
- `scripts/test-protocol.ps1`: HMAC/416 mutações/256 baterias, wire e fila durável passaram.
- `zig c++ firmware/tests/time_recovery.cpp ...` e execução: sete asserções passaram.
- Arduino CLI: receptor ESP32 TCP 949929 bytes; ESP32-C3 TCP 1012379 bytes; ESP32 TLS
  1039793 bytes. Não houve flash da placa. Compilador nativo Zig emitiu avisos de dllexport.

Docker Desktop retornou erro 500; testes SQL usaram banco embarcado descartável como alternativa.
Nenhuma migration ou fixture foi executada em produção. Frontend/Express não foram alterados
ou testados nesta continuação; testes de JWT real, rede/radio físicos e browser estão pendentes.
Comandos reproduzíveis e limitações: `ml/docs/CONTRATO_SQL.md`, `ENTREGA_ML_SQL.md`.

## S0/S1 — linha de base

`cd ml; .\.venv\Scripts\python.exe -m pytest tests -q`: **45 passaram**, 7,43 s. Inclui treino/load/inferência de ambas as GRUs em CPU. 14 avisos de depreciação Keras/NumPy já existentes, sem falhas. Fixtures não alteram Supabase.

A auditoria anterior confirmou 101 cálculos numéricos em modo somente leitura. Não é validação de posição física. Nenhum modelo operacional foi aprovado.

## S2–S10

Resultados serão registrados após execução. Build/testes do frontend/backend ainda não executados nesta entrega.

S2: `pytest tests/test_provenance.py tests/test_database.py tests/test_diagnostics.py -q`: **23 passaram** (0,88 s). Inclui exclusão mútua/liberação, calibração modificada, bloqueio experimental, recuperação de outbox sem impedir outro animal e modo GET. Banco real não modificado.
