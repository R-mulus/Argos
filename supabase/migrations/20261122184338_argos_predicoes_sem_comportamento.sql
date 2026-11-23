-- PROPOSTA de ml/sql/proposta_predicao_posicao.sql (branch backend-iot), no fluxo de migrations da dev.
-- Aplicada ao Supabase hospedado em 22/11/2026 (versão 20261122184338).
-- O modelo de posição não produz comportamento: NULL = indisponível. Não inventar classe nem confiança.
alter table public.argos_predicoes alter column comportamento drop not null;
alter table public.argos_predicoes alter column confianca drop not null;
alter table public.argos_predicoes alter column probabilidades drop not null;
