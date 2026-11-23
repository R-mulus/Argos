-- Proposta: aplicar somente após revisão em staging. Nenhum backfill de proveniência.
begin;
alter table public.argos_localizacoes
 add column referencial_versao text,
 add column calibracao_sha256 text,
 add column origem text check (origem in ('real','experimental','synthetic'));
alter table public.argos_predicoes
 alter column comportamento drop not null,
 alter column confianca drop not null,
 alter column probabilidades drop not null,
 add column referencial_versao text,
 add column calibracao_sha256 text,
 add column origem text check (origem in ('real','experimental','synthetic'));
-- Somente o processo administrativo pode registrar a revisão humana da fonte.
alter table public.argos_observacoes_visao
 add column revisado_em timestamptz,
 add column revisado_por text;
grant select on public.argos_observacoes_visao to authenticated;
create policy argos_visao_revisada_proprietario on public.argos_observacoes_visao
 for select to authenticated using (
 revisado_em is not null and nullif(btrim(revisado_por),'') is not null
 and exists (select 1 from public.propriedades p
 where p.id = propriedade_id and p.usuario_id = (select auth.uid())));
create index argos_visao_animal_tempo on public.argos_observacoes_visao
 (propriedade_id,animal_id,observado_em);
commit;
