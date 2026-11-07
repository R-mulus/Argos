# Migrações Supabase — Argos

Projeto remoto: `pqmdqtcjemgnjtugtuqy`.

Migrações já aplicadas na instância hospedada em 04/11/2026:
- `20261104164037_argos_initial_schema.sql`: esquema inicial, índices, validações e políticas RLS.
- `20261104164737_argos_harden_rls_event_trigger.sql`: remove `EXECUTE` desnecessário da função automática `public.rls_auto_enable()` caso exista.

**Não executar essas migrações manualmente no projeto remoto novamente.** Os identificadores foram mantidos iguais ao histórico remoto do Supabase. Para um projeto novo/local, utilize Supabase CLI, seguindo a documentação de migrations.

A segunda migração foi escrita de forma condicional para funcionar também em instalações locais que não tenham a função `rls_auto_enable()` do ambiente hospedado.

Não introduza dados de teste em migrations de estrutura. O consumidor MQTT deve autenticar-se separadamente dos usuários da interface, e o papel de serviço deve ser exclusivo do servidor.
