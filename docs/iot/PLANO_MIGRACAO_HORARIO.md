# Plano de correção do resumo — 19/11/2026

Projeto: Argos (`pqmdqtcjemgnjtugtuqy`). Migração local:
`supabase/migrations/20261119154550_argos_resumo_horario_captura.sql`.

## Evidência e impacto

A auditoria somente de leitura encontrou oito detecções com `detectado_em IS NULL`
e `vinculo_id IS NOT NULL`. `historico_deteccoes` usa recebimento como fallback;
`resumo_monitoramento` usava esse fallback para decidir recência e disputar zona.
Isso pode apresentar captura desconhecida como recente.

A migração substitui somente a função `resumo_monitoramento(uuid)`, mantendo
assinatura, campos JSON, SECURITY INVOKER, search_path vazio e permissões.
Recência, disputa de dois segundos e instante de posição passam a usar captura.
Detecções sem captura continuam preservadas; aparecem como `sem_horario` quando
não há captura válida para aquele animal. Uma captura sem horário não supera a
última captura conhecida. A contagem pode diminuir legitimamente se antes incluía
registros sem horário. Não modifica tabelas, cadastros, vínculos ou detecções.

## Validação executada

Aplicada em PostgreSQL 17 descartável, após as migrações locais, com
`ON_ERROR_STOP=1`. Regressão `iot/tests/test_resumo_horario.py` passou:
recebimento atual com captura nula resulta em zero recentes e um sem horário.
Suite Python com banco: 16 aprovados, um teste TensorFlow ignorado.

## Aplicação proposta

1. Confirmar autorização para modificar a função no Supabase hospedado.
2. Conferir novamente histórico de migrações e definição da função (evitar
   sobrescrever mudanças concorrentes).
3. Aplicar somente esta migração; não executar migrações já aplicadas nem a de
   hábitos, que é trabalho local preexistente e continua pendente.
4. Consultar resumo e verificar contagens, assinatura e grants, sem inserir dados.

Rollback: restaurar a definição anterior da função a partir da migração
`20261113000010_argos_resumo_monitoramento.sql`, por nova migração. Isso restaura
também o defeito temporal, portanto só em caso de regressão confirmada.

**Estado: aplicada ao Supabase após autorização explícita em 19/11/2026.**

O MCP atribuiu a versão 20261119154550; o arquivo local foi alinhado a ela.
Consulta posterior confirmou a função nova, SECURITY INVOKER e preservação
de 4.021 detecções e 50 vínculos. Resumo: 49 ativos, 45 desatualizados,
4 nunca detectados, zero recentes.
