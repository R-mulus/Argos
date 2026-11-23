-- PROPOSTA PARA REVISÃO. NÃO APLICADA. Nenhum comando Python executa este arquivo.
-- O schema real exige comportamento/confianca/probabilidades mesmo para regressão.
-- NULL representa comportamento indisponível; não inventar classes nem confiança.
-- O colaborador deve gerar a migration no fluxo Supabase de dev após aprovação.
begin;
alter table public.argos_predicoes alter column comportamento drop not null;
alter table public.argos_predicoes alter column confianca drop not null;
alter table public.argos_predicoes alter column probabilidades drop not null;
commit;
