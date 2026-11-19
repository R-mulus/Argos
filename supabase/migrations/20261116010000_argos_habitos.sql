-- Agregados de coleta preservam histórico para previsão mensal, sem coordenadas.
begin;
create table public.argos_habitos_diarios (
 propriedade_id uuid not null references public.propriedades(id) on delete cascade,
 animal_id uuid not null, dia date not null,
 contagens jsonb not null check (jsonb_typeof(contagens) = 'object'),
 atualizado_em timestamptz not null default now(),
 primary key (propriedade_id, animal_id, dia),
 foreign key (animal_id, propriedade_id) references public.animais(id, propriedade_id) on delete cascade
);
create table public.argos_previsoes_habitos (
 id uuid primary key default gen_random_uuid(),
 propriedade_id uuid not null references public.propriedades(id) on delete cascade,
 animal_id uuid not null, observado_em date not null, modelo_versao text not null,
 previsoes jsonb not null check (jsonb_typeof(previsoes) = 'array' and jsonb_array_length(previsoes) = 30),
 criado_em timestamptz not null default now(),
 unique (propriedade_id, animal_id, observado_em, modelo_versao),
 foreign key (animal_id, propriedade_id) references public.animais(id, propriedade_id) on delete cascade
);
alter table public.argos_habitos_diarios enable row level security;
alter table public.argos_previsoes_habitos enable row level security;
revoke all on public.argos_habitos_diarios, public.argos_previsoes_habitos from public, anon, authenticated;
grant select on public.argos_habitos_diarios, public.argos_previsoes_habitos to authenticated;
grant all on public.argos_habitos_diarios, public.argos_previsoes_habitos to service_role;
create policy habitos_leitura on public.argos_habitos_diarios for select to authenticated
 using (exists(select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())));
create policy previsoes_habitos_leitura on public.argos_previsoes_habitos for select to authenticated
 using (exists(select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())));
commit;
