-- Uma fotografia por chamada; o horário da nuvem não rejuvenesce replays.
create function public.resumo_monitoramento(p_propriedade uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
with leituras as (
  select h.*, max(h.instante_referencia) over (partition by h.animal_id) as ultima_deteccao_em
  from public.historico_deteccoes h
  where h.propriedade_id = p_propriedade and h.animal_id is not null
), escolhidas as (
  select distinct on (animal_id) *
  from leituras
  where ultima_deteccao_em is null
     or instante_referencia >= ultima_deteccao_em - interval '2 seconds'
  order by animal_id, rssi_dbm desc, instante_referencia desc nulls last, receptor_id, id
), posicoes as (
  select a.id as animal_id, a.identificacao, e.ultima_deteccao_em,
         e.instante_referencia as instante_posicao, e.zona_id, e.zona_nome,
         e.receptor_id, e.rssi_dbm,
         case when e.id is null then 'nunca_detectado'
              when e.ultima_deteccao_em is null then 'sem_horario'
              when e.ultima_deteccao_em < now() - interval '5 minutes' then 'desatualizado'
              else 'recente' end as estado
  from public.animais a left join escolhidas e on e.animal_id = a.id
  where a.propriedade_id = p_propriedade and a.status = 'ativo'
), setores as (
  select z.id, z.nome, count(p.animal_id) as quantidade
  from public.zonas z left join posicoes p on p.zona_id = z.id and p.estado = 'recente'
  where z.propriedade_id = p_propriedade
  group by z.id, z.nome, z.ativa
  having z.ativa or count(p.animal_id) > 0
)
select jsonb_build_object(
  'atualizado_em', now(),
  'total_ativos', count(*),
  'recentes', count(*) filter (where estado = 'recente'),
  'recentes_sem_zona', count(*) filter (where estado = 'recente' and zona_id is null),
  'desatualizados', count(*) filter (where estado = 'desatualizado'),
  'sem_horario', count(*) filter (where estado = 'sem_horario'),
  'nunca_detectados', count(*) filter (where estado = 'nunca_detectado'),
  'animais', coalesce(jsonb_agg(to_jsonb(p) order by identificacao, animal_id), '[]'::jsonb),
  'zonas', coalesce((select jsonb_agg(to_jsonb(s) order by nome, id) from setores s), '[]'::jsonb)
) from posicoes p;
$$;
revoke all on function public.resumo_monitoramento(uuid) from public, anon;
grant execute on function public.resumo_monitoramento(uuid) to authenticated;
