-- Referência espacial do mapa (escrita em 17/11/2026, aplicada no projeto hospedado em 18/11/2026,
-- versão 20261118113632 do histórico). Migração aditiva: não altera tabelas, contratos MQTT
-- nem o worker Python. Reaproveita argos_posicoes_receptores (x_m, y_m, rssi_1m_dbm,
-- expoente_perda) como calibração dos receptores.
--
-- Sistema local: x_m e y_m em metros a partir de uma origem escolhida na propriedade, o mesmo usado
-- pela trilateração. A referência diz como desenhar esse sistema:
--   * geografico: a origem tem latitude/longitude medidas em campo e o eixo +y aponta para o
--     azimute informado (graus a partir do norte verdadeiro, sentido horário). Só assim o mapa-base
--     geográfico é usado.
--   * planta: uma imagem aérea ou planta calibrada em metros, com o retângulo que ela cobre no
--     sistema local. Não há latitude/longitude: a tela mostra apenas metros.
-- Sem linha nesta tabela, a referência está pendente e o mapa mostra só a grade local.
begin;

create table if not exists public.argos_referencias_espaciais (
  propriedade_id uuid primary key references public.propriedades(id) on delete cascade,
  modo text not null,
  origem_latitude double precision,
  origem_longitude double precision,
  azimute_eixo_y_graus double precision not null default 0,
  planta_url text,
  planta_x_min_m double precision,
  planta_y_min_m double precision,
  planta_x_max_m double precision,
  planta_y_max_m double precision,
  atualizado_em timestamptz not null default now(),
  constraint argos_referencia_modo_ck check (modo in ('geografico', 'planta')),
  constraint argos_referencia_azimute_ck check (azimute_eixo_y_graus >= 0 and azimute_eixo_y_graus < 360),
  constraint argos_referencia_campos_ck check (
    (modo = 'geografico'
      and origem_latitude between -85 and 85
      and origem_longitude between -180 and 180
      and planta_url is null and planta_x_min_m is null and planta_y_min_m is null
      and planta_x_max_m is null and planta_y_max_m is null)
    or
    (modo = 'planta'
      and origem_latitude is null and origem_longitude is null
      and planta_url ~ '^https://[^[:space:]]+$' and length(planta_url) <= 2048
      and planta_x_min_m between -1000000 and 1000000 and planta_x_max_m between -1000000 and 1000000
      and planta_y_min_m between -1000000 and 1000000 and planta_y_max_m between -1000000 and 1000000
      and planta_x_max_m > planta_x_min_m and planta_y_max_m > planta_y_min_m)
  )
);

-- Contorno de cada zona no sistema local: [[x_m, y_m], ...], de 3 a 200 vértices, sem repetir o
-- primeiro no final. A chave composta garante que zona e propriedade combinam.
create table if not exists public.argos_geometrias_zonas (
  zona_id uuid primary key,
  propriedade_id uuid not null,
  pontos jsonb not null,
  atualizado_em timestamptz not null default now(),
  constraint argos_geometria_zona_fk foreign key (zona_id, propriedade_id)
    references public.zonas(id, propriedade_id) on delete cascade
);
create index if not exists argos_geometrias_zonas_propriedade_idx
  on public.argos_geometrias_zonas (propriedade_id);

create or replace function public.argos_validar_geometria_zona() returns trigger
  language plpgsql set search_path = '' as $$
declare
  ponto jsonb;
begin
  if jsonb_typeof(new.pontos) <> 'array'
     or jsonb_array_length(new.pontos) not between 3 and 200 then
    raise exception 'Geometria da zona deve ter de 3 a 200 vertices';
  end if;
  for ponto in select value from jsonb_array_elements(new.pontos) loop
    if jsonb_typeof(ponto) <> 'array' or jsonb_array_length(ponto) <> 2
       or jsonb_typeof(ponto -> 0) <> 'number' or jsonb_typeof(ponto -> 1) <> 'number'
       or abs((ponto ->> 0)::double precision) > 1000000
       or abs((ponto ->> 1)::double precision) > 1000000 then
      raise exception 'Vertice invalido na geometria da zona';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists argos_validar_geometria_zona on public.argos_geometrias_zonas;
create trigger argos_validar_geometria_zona before insert or update on public.argos_geometrias_zonas
  for each row execute function public.argos_validar_geometria_zona();

-- Últimas cinco estimativas por animal, com o horário em que a detecção chegou ao banco. O
-- frontend usa as anteriores para não mover o marcador por uma estimativa isolada. Estimativas sem
-- horário de observação ficam de fora: não dá para ordená-las nem dizer se são atuais.
-- security_invoker aplica o RLS de argos_localizacoes a quem consulta.
create or replace view public.argos_localizacoes_recentes with (security_invoker = true) as
select r.id, r.propriedade_id, r.transmissor_id, r.animal_id, r.evento_id, r.x_m, r.y_m,
       r.erro_residual_m, r.receptores_utilizados, r.observado_em, r.calculado_em,
       (select max(d.recebido_em) from public.deteccoes d
         where d.propriedade_id = r.propriedade_id and d.transmissor_id = r.transmissor_id
           and d.evento_id = r.evento_id) as recebido_em
from (
  select l.*, row_number() over (
    partition by l.propriedade_id, l.animal_id
    order by l.observado_em desc, l.calculado_em desc, l.id
  ) as ordem
  from public.argos_localizacoes l
  where l.animal_id is not null and l.observado_em is not null
) r
where r.ordem <= 5;

alter table public.argos_referencias_espaciais enable row level security;
alter table public.argos_geometrias_zonas enable row level security;
revoke all on public.argos_referencias_espaciais, public.argos_geometrias_zonas,
  public.argos_localizacoes_recentes from public, anon, authenticated;
grant select, insert, update on public.argos_referencias_espaciais to authenticated;
grant select, insert, update, delete on public.argos_geometrias_zonas to authenticated;
grant select on public.argos_localizacoes_recentes to authenticated;
grant all on public.argos_referencias_espaciais, public.argos_geometrias_zonas to service_role;
grant select on public.argos_localizacoes_recentes to service_role;
revoke all on function public.argos_validar_geometria_zona() from public, anon, authenticated;

drop policy if exists argos_referencia_proprietario on public.argos_referencias_espaciais;
create policy argos_referencia_proprietario on public.argos_referencias_espaciais for all to authenticated
  using (exists (select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())))
  with check (exists (select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())));

drop policy if exists argos_geometria_proprietario on public.argos_geometrias_zonas;
create policy argos_geometria_proprietario on public.argos_geometrias_zonas for all to authenticated
  using (exists (select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())))
  with check (exists (select 1 from public.propriedades p where p.id = propriedade_id and p.usuario_id = (select auth.uid())));

commit;
