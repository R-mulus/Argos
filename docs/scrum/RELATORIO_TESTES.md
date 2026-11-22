# Relatório de testes por sprint

## S0/S1 — linha de base

`cd ml; .\.venv\Scripts\python.exe -m pytest tests -q`: **45 passaram**, 7,43 s. Inclui treino/load/inferência de ambas as GRUs em CPU. 14 avisos de depreciação Keras/NumPy já existentes, sem falhas. Fixtures não alteram Supabase.

A auditoria anterior confirmou 101 cálculos numéricos em modo somente leitura. Não é validação de posição física. Nenhum modelo operacional foi aprovado.

## S2–S10

Resultados serão registrados após execução. Build/testes do frontend/backend ainda não executados nesta entrega.
