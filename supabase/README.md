# Migrações Supabase — Argos

Projeto remoto: `pqmdqtcjemgnjtugtuqy`.

Migrações já aplicadas na instância hospedada em 04/11/2026:
- `20261104164037_argos_initial_schema.sql`: esquema inicial, índices, validações e políticas RLS.
- `20261104164737_argos_harden_rls_event_trigger.sql`: remove `EXECUTE` desnecessário da função automática `public.rls_auto_enable()` caso exista.

**Não executar essas migrações manualmente no projeto remoto novamente.** Os identificadores foram mantidos iguais ao histórico remoto do Supabase. Para um projeto novo/local, utilize Supabase CLI, seguindo a documentação de migrations.

A segunda migração foi escrita de forma condicional para funcionar também em instalações locais que não tenham a função `rls_auto_enable()` do ambiente hospedado.

Não introduza dados de teste em migrations de estrutura. O consumidor MQTT deve autenticar-se separadamente dos usuários da interface, e o papel de serviço deve ser exclusivo do servidor.

Em 12/11/2026 foi aplicada a migração `20261112165455_argos_historico_deteccoes.sql`. Ela adiciona o horário de recepção no gateway, a consulta de histórico com as políticas de acesso do usuário e o índice usado na paginação. Eventos anteriores mantêm os horários originalmente registrados.

A migração 20261113000010_argos_resumo_monitoramento.sql cria a consulta consolidada por animal e zona. Foi aplicada no projeto da apresentação.

As migrações seguintes adicionam pesagens manuais, exportação CSV, central de avisos e prévia de retenção. Consulte os [arquivos SQL em ordem de versão](migrations/) e os [contratos de uso na API](../backend/README.md). A prévia calcula o impacto do prazo selecionado sem excluir leituras.

## Migrações de 16/11/2026

`20261116000000_argos_iot_processamento.sql` (branch `backend-iot`) foi aplicada manualmente no projeto hospedado e registrada depois no histórico de migrações, sem nova execução. `20261116181500_argos_alinhamento_remoto.sql` alinha o repositório ao banco hospedado. Ela versiona as tabelas legadas do MVP de IoT (`argos_observacoes_visao` e `argos_sync_outbox`, sem uso no código atual), retira os privilégios de `anon` e `authenticated` dessas tabelas e remove a restrição duplicada `uq_argos_loc_evento`. Também cria os índices das chaves estrangeiras compostas.

## Carga de demonstração

`seeds/demonstracao.sql` cria, na propriedade "Fazenda Experimental", 48 animais `DEMO-xxx`, coleiras, vínculos, 6 zonas e receptores `DEMO · …`, 30 dias de histórico até o dia anterior, cinco pesagens semanais e 8 avisos simulados. Os IDs seguem o formato de UUID exigido pela API. Cada execução acrescenta um lote de leituras recentes e completa o histórico dos dias que faltam, sem duplicar o resto. As leituras recentes valem por 5 minutos no monitoramento. `seeds/demonstracao_remover.sql` apaga apenas os registros da carga. Execute os dois manualmente, como administrador, no SQL Editor. Nunca coloque dados de demonstração em migrações.

