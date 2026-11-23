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

## Migrações de 18/11/2026 (aplicadas no projeto hospedado)

`20261118113632_argos_referencia_espacial.sql` é aditiva: cria `argos_referencias_espaciais` (origem geográfica ou planta em metros), `argos_geometrias_zonas` (contorno das zonas em metros, chave composta com `zonas`) e a view `argos_localizacoes_recentes` (`security_invoker`, cinco estimativas por animal com `recebido_em`). Todas com RLS por dono da propriedade; `anon` sem acesso. Reaproveita `argos_posicoes_receptores` para a calibração. `testes/referencia_espacial.sql` verifica restrições, view e isolamento entre propriedades num PostgreSQL local, dentro de uma transação desfeita. Ver [docs/MAPA.md](../docs/MAPA.md).

`20261118113726_argos_avisos_comunicacao.sql` (RF06) liga o `pg_cron` e agenda `public.argos_verificar_comunicacao()` a cada 5 minutos (job `argos-verificar-comunicacao`). Ela cria avisos `receptor_sem_leitura` (receptor ativo sem leitura há 15 min, com comunicação nas últimas 24 h) e `coleira_sem_deteccao` (coleira vinculada sem detecção há 30 min enquanto algum receptor comunica), um por queda, e os encerra quando o dispositivo volta. Dispositivos da carga de demonstração (`versao_firmware = 'simulado'`) ficam de fora. A função não pode ser chamada por `anon` nem `authenticated`.

## Carga de demonstração

`seeds/demonstracao.sql` cria, na propriedade "Fazenda Experimental", 48 animais `DEMO-xxx`, coleiras, vínculos, 6 zonas e receptores `DEMO · …`, 30 dias de histórico até o dia anterior, cinco pesagens semanais e 8 avisos simulados. Os IDs seguem o formato de UUID exigido pela API. Cada execução acrescenta um lote de leituras recentes e completa o histórico dos dias que faltam, sem duplicar o resto. As leituras recentes valem por 5 minutos no monitoramento. `seeds/demonstracao_remover.sql` apaga apenas os registros da carga. Execute os dois manualmente, como administrador, no SQL Editor. Nunca coloque dados de demonstração em migrações.

## Migrações de 19 a 22/11/2026 (aplicadas no projeto hospedado)

`20261119154550_argos_resumo_horario_captura.sql` foi aplicada no projeto hospedado a partir da branch `backend-iot` e versionada na `dev` em 22/11. O `resumo_monitoramento` passa a usar só `detectado_em` (horário de captura): o recebimento não torna recente uma leitura antiga.

`20261122184335_argos_zona_historica_deteccoes.sql` cria o trigger `deteccoes_atribuir_zona_historica`: na inserção, uma detecção sem zona recebe a zona ativa do receptor quando ela não foi alterada depois de `detectado_em`. Sem horário, sem zona. Vale para qualquer worker de ingestão. `manutencao/20261122_preencher_zona_historica.sql` aplica a mesma regra às detecções antigas e **não foi executado**.

`20261122184338_argos_predicoes_sem_comportamento.sql` permite `comportamento`, `confianca` e `probabilidades` nulos em `argos_predicoes` (modelo de posição sem classificação).

`testes/zona_historica.sql` cobre os casos do trigger, o preenchimento e a contagem no resumo, num PostgreSQL local. O `pg_cron` de `20261118113726` não existe fora do Supabase: no teste local, crie `cron.schedule` simulado e ignore o `create extension pg_cron`. Ver [docs/integracao/ML_BACKEND.md](../docs/integracao/ML_BACKEND.md).

## Migrações do ML de 22/11/2026 (aplicadas no projeto hospedado em 23/11)

`20261122235957_argos_ml_proveniencia.sql` e `20261122235958_argos_ml_kpis.sql` vêm da branch `backend-iot`
(Larápio). Foram executadas a partir do histórico de migrações com as versões originais dos arquivos,
depois de conferir o MD5 do conteúdo (`4ae74a6f…` e `f51e7b7c…`, sem as linhas `begin;`/`commit;`).

- Proveniência: `argos_localizacoes` e `argos_predicoes` ganham `referencial_versao`, `calibracao_sha256`
  e `origem`; `argos_observacoes_visao` ganha `revisado_em`/`revisado_por` e pode ser lida pelo dono da
  propriedade só nas linhas revisadas (RLS já ligado; sem acesso para `anon`).
- KPIs: `argos_ml_analise(animal, inicio, fim, periodo)` é `security invoker`, executável só por
  `authenticated`, e devolve o JSON `AnaliseML` de `shared/ml.ts`. Localizações sem proveniência
  (por exemplo as gravadas pelo `iot/`) não entram nos KPIs.

Teste isolado: `cd supabase/testes; pnpm install --ignore-workspace; node --test ml.test.mjs` (PGlite, aplica
todas as migrations com `pg_cron` simulado). Para o teste ponta a ponta com Python, defina
`ARGOS_TEST_PYTHON` com o Python do `ml/.venv`.

## Tabela de modelos do ML (aplicada em 23/11/2026)

`20261123171004_argos_ml_modelos.sql` cria `argos_modelos_ml`: metadados públicos de cada versão de modelo
(tarefa, aprovação para demonstração ou produção, origem, referencial, métricas), com RLS de leitura para o
dono da propriedade e escrita só pelo processo de servidor. Foi aplicada pelo Larápio no projeto hospedado
com a versão `20261123171004`; o arquivo do pacote dele se chamava `20261123142644_argos_ml_modelos.sql` e tem
o mesmo conteúdo (conferido contra o histórico do Supabase). Coberta por `testes/ml.test.mjs` (teste 9, que
precisa de `ARGOS_TEST_DEMO_EXPORT` gerado pelo `pytest tests/test_academic.py`).
