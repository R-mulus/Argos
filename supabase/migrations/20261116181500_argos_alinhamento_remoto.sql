-- Alinhamento do repositório com o projeto Supabase hospedado (16/11/2026).
--
-- 1. As tabelas argos_observacoes_visao e argos_sync_outbox vieram do MVP de IoT e já existiam no
--    banco hospedado sem migração no repositório. Estão vazias e nenhum código atual as usa; ficam
--    versionadas até a frente de IoT/ML decidir mantê-las ou removê-las. São internas: só o papel
--    de serviço acessa (no banco hospedado, anon e authenticated tinham todos os privilégios,
--    inclusive TRUNCATE, que o RLS não bloqueia).
-- 2. argos_localizacoes tinha a restrição uq_argos_loc_evento do MVP e o índice argos_loc_evento_iot
--    (20261116000000) sobre as mesmas colunas. Fica só o índice, que é o que a migração cria numa
--    instalação nova; o ON CONFLICT do worker Python continua usando essas colunas.
-- 3. Índices para as chaves estrangeiras compostas sem cobertura apontadas pelo linter do Supabase.

create table if not exists public.argos_observacoes_visao (
  id uuid primary key,
  propriedade_id uuid not null,
  animal_id uuid not null,
  observado_em timestamptz not null,
  comportamento varchar(30) not null,
  confianca double precision not null,
  x_m double precision,
  y_m double precision,
  camera_id varchar(100) not null
);

create table if not exists public.argos_sync_outbox (
  id uuid primary key,
  evento_chave varchar(255) not null unique,
  payload json not null,
  criado_em timestamptz not null
);

alter table public.argos_observacoes_visao enable row level security;
alter table public.argos_sync_outbox enable row level security;
revoke all on public.argos_observacoes_visao, public.argos_sync_outbox from public, anon, authenticated;
grant all on public.argos_observacoes_visao, public.argos_sync_outbox to service_role;

alter table public.argos_localizacoes drop constraint if exists uq_argos_loc_evento;
create unique index if not exists argos_loc_evento_iot
  on public.argos_localizacoes (propriedade_id, transmissor_id, evento_id);

create index if not exists alertas_animal_fk_idx on public.alertas (animal_id, propriedade_id);
create index if not exists alertas_dispositivo_fk_idx on public.alertas (dispositivo_id, propriedade_id);
create index if not exists deteccoes_receptor_fk_idx on public.deteccoes (receptor_id, propriedade_id);
create index if not exists deteccoes_transmissor_fk_idx on public.deteccoes (transmissor_id, propriedade_id);
create index if not exists deteccoes_vinculo_fk_idx on public.deteccoes (vinculo_id, propriedade_id, transmissor_id);
create index if not exists deteccoes_zona_fk_idx on public.deteccoes (zona_id, propriedade_id);
create index if not exists pesagens_animal_fk_idx on public.pesagens (animal_id, propriedade_id);
create index if not exists vinculos_animal_fk_idx on public.vinculos (animal_id, propriedade_id);
create index if not exists vinculos_propriedade_fk_idx on public.vinculos (propriedade_id);
create index if not exists vinculos_transmissor_fk_idx on public.vinculos (transmissor_id, propriedade_id);
create index if not exists zonas_receptor_fk_idx on public.zonas (receptor_id, propriedade_id);
