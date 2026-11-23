-- Extensões aditivas: compatíveis com as tabelas do MVP anexado.
-- Aplicar primeiro em staging; não executa automaticamente no startup Python.
begin;
create table if not exists public.argos_posicoes_receptores (
 receptor_id uuid primary key, propriedade_id uuid not null,
 x_m double precision not null, y_m double precision not null,
 rssi_1m_dbm double precision not null, expoente_perda double precision not null,
 atualizado_em timestamptz not null default now()
);
create table if not exists public.argos_localizacoes (
 id uuid primary key, propriedade_id uuid not null, transmissor_id uuid not null,
 animal_id uuid, evento_id varchar not null, x_m double precision not null,
 y_m double precision not null, erro_residual_m double precision not null,
 receptores_utilizados integer not null, calculado_em timestamptz not null,
 observado_em timestamptz
);
-- Falha explicitamente se houver duplicatas legadas: não apaga histórico para migrar.
create unique index if not exists argos_loc_evento_iot on public.argos_localizacoes
 (propriedade_id, transmissor_id, evento_id);
create index if not exists argos_loc_animal_tempo on public.argos_localizacoes
 (propriedade_id, animal_id, observado_em desc);
create index if not exists argos_deteccoes_evento on public.deteccoes
 (propriedade_id, transmissor_id, evento_id);
create table if not exists public.argos_predicoes (
 id uuid primary key, propriedade_id uuid not null, animal_id uuid not null,
 comportamento varchar not null, confianca double precision not null,
 proximo_x_m double precision, proximo_y_m double precision,
 modelo_versao varchar not null, probabilidades json not null, criado_em timestamptz not null
);
alter table public.argos_predicoes add column if not exists evento_id text;
alter table public.argos_predicoes add column if not exists observado_em timestamptz;
alter table public.argos_predicoes add column if not exists previsto_para timestamptz;
alter table public.argos_predicoes add column if not exists atual_x_m double precision;
alter table public.argos_predicoes add column if not exists atual_y_m double precision;
create unique index if not exists argos_pred_evento_modelo on public.argos_predicoes
 (propriedade_id, animal_id, evento_id, modelo_versao);
create index if not exists argos_pred_animal_tempo on public.argos_predicoes
 (propriedade_id, animal_id, observado_em desc);

create table public.argos_iot_jobs (
 propriedade_id uuid not null references public.propriedades(id),
 transmissor_id uuid not null, evento_id text not null,
 disponivel_em timestamptz not null default now(),
 estado text not null default 'pendente', tentativas integer not null default 0,
 atualizado_em timestamptz not null default now(),
 primary key (propriedade_id, transmissor_id, evento_id)
);
create index argos_jobs_pendentes on public.argos_iot_jobs(disponivel_em)
 where estado = 'pendente';
create function public.argos_agendar_localizacao() returns trigger
 language plpgsql security definer set search_path = '' as $$
begin
 insert into public.argos_iot_jobs(propriedade_id, transmissor_id, evento_id, disponivel_em)
 values (new.propriedade_id, new.transmissor_id, new.evento_id, now() + interval '2 seconds')
 on conflict (propriedade_id, transmissor_id, evento_id) do update
 set estado = 'pendente', disponivel_em = now() + interval '2 seconds', tentativas = 0,
 atualizado_em = now();
 return new;
end $$;
revoke all on function public.argos_agendar_localizacao() from public, anon, authenticated;
create trigger argos_agendar_localizacao after insert on public.deteccoes
 for each row execute function public.argos_agendar_localizacao();

-- Validação também para gravação direta via PostgREST.
create function public.argos_validar_coordenadas() returns trigger
 language plpgsql set search_path = '' as $$
begin
 if not (new.x_m between -1000000 and 1000000 and new.y_m between -1000000 and 1000000
   and new.rssi_1m_dbm between -100 and -10 and new.expoente_perda between 1 and 6)
 or not exists(select 1 from public.dispositivos d where d.id = new.receptor_id
   and d.propriedade_id = new.propriedade_id and d.tipo = 'receptor' and d.status = 'ativo') then
   raise exception 'Coordenadas/calibracao ou receptor invalidos';
 end if;
 return new;
end $$;
create trigger argos_validar_coordenadas before insert or update on public.argos_posicoes_receptores
 for each row execute function public.argos_validar_coordenadas();

alter table public.argos_posicoes_receptores enable row level security;
alter table public.argos_localizacoes enable row level security;
alter table public.argos_predicoes enable row level security;
alter table public.argos_iot_jobs enable row level security;
revoke all on public.argos_posicoes_receptores, public.argos_localizacoes,
 public.argos_predicoes, public.argos_iot_jobs from public, anon, authenticated;
grant select, insert, update on public.argos_posicoes_receptores to authenticated;
grant select on public.argos_localizacoes, public.argos_predicoes to authenticated;
grant all on public.argos_posicoes_receptores, public.argos_localizacoes,
 public.argos_predicoes, public.argos_iot_jobs to service_role;
create policy argos_coordenadas_proprietario on public.argos_posicoes_receptores for all to authenticated
 using (exists(select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())))
 with check (exists(select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())));
create policy argos_localizacoes_proprietario on public.argos_localizacoes for select to authenticated
 using (exists(select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())));
create policy argos_predicoes_proprietario on public.argos_predicoes for select to authenticated
 using (exists(select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())));
commit;
