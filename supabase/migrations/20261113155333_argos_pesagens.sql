create table public.pesagens (
  animal_id uuid not null,
  propriedade_id uuid not null,
  data_pesagem date not null,
  peso_kg numeric not null check (peso_kg > 0 and peso_kg < 'Infinity'::numeric),
  primary key (animal_id, data_pesagem),
  foreign key (animal_id, propriedade_id) references public.animais(id, propriedade_id) on delete cascade
);
alter table public.pesagens enable row level security;
revoke all on public.pesagens from public, anon, authenticated;
grant select, insert on public.pesagens to authenticated;
create policy pesagens_ler on public.pesagens for select to authenticated using (
  propriedade_id in (select id from public.propriedades where usuario_id = (select auth.uid()))
);
create policy pesagens_inserir on public.pesagens for insert to authenticated with check (
  propriedade_id in (select id from public.propriedades where usuario_id = (select auth.uid()))
);

create function public.historico_pesagens(p_animal uuid, p_inicio date, p_fim date, p_limit integer, p_offset integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with periodo as (
    select data_pesagem, peso_kg from public.pesagens
    where animal_id = p_animal and (p_inicio is null or data_pesagem >= p_inicio)
      and (p_fim is null or data_pesagem <= p_fim)
  ), primeira as (select * from periodo order by data_pesagem limit 1),
  ultima as (select * from periodo order by data_pesagem desc limit 1),
  pagina as (select * from periodo order by data_pesagem desc
    limit least(greatest(p_limit,1),100) offset greatest(p_offset,0))
  select jsonb_build_object(
    'data', coalesce((select jsonb_agg(to_jsonb(p) order by data_pesagem desc) from pagina p), '[]'::jsonb),
    'count', (select count(*) from periodo), 'limit', p_limit, 'offset', p_offset,
    'ganho_medio_diario_kg', (select round((u.peso_kg - p.peso_kg) /
      nullif(u.data_pesagem - p.data_pesagem, 0), 3) from primeira p cross join ultima u)
  );
$$;
revoke all on function public.historico_pesagens(uuid,date,date,integer,integer) from public, anon;
grant execute on function public.historico_pesagens(uuid,date,date,integer,integer) to authenticated;
