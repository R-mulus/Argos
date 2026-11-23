create function public.previa_retencao(p_propriedade uuid, p_dias integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare corte timestamptz;
begin
  if p_dias is null or p_dias < 1 or p_dias > 3650 then
    raise exception 'Informe um prazo entre 1 e 3650 dias.' using errcode = '23514';
  end if;
  corte := now() - p_dias * interval '24 hours';
  return (
    with leituras as (
      select d.*, d.recebido_em < corte as elegivel
      from public.deteccoes d where d.propriedade_id = p_propriedade
    ), por_animal as (
      select v.animal_id, bool_and(l.elegivel) as perderia_historico
      from leituras l join public.vinculos v
        on (v.id, v.propriedade_id, v.transmissor_id) = (l.vinculo_id, l.propriedade_id, l.transmissor_id)
      group by v.animal_id
    )
    select jsonb_build_object(
      'calculado_em', now(), 'dias', p_dias, 'corte_recebido_em', corte,
      'total', count(*),
      'elegiveis', count(*) filter (where elegivel),
      'preservadas', count(*) filter (where not elegivel),
      'primeira_recebida_em', min(recebido_em),
      'ultima_elegivel_recebida_em', max(recebido_em) filter (where elegivel),
      'animais_sem_historico_apos_corte', (select count(*) from por_animal where perderia_historico)
    ) from leituras
  );
end;
$$;
revoke all on function public.previa_retencao(uuid,integer) from public, anon;
grant execute on function public.previa_retencao(uuid,integer) to authenticated;
