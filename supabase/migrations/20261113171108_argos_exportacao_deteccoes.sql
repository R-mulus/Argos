create function public.exportar_deteccoes(p_propriedade uuid, p_animal uuid, p_zona uuid, p_inicio timestamptz, p_fim timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
select coalesce(jsonb_agg(to_jsonb(h) order by instante_referencia desc nulls last, recebido_em desc, id), '[]'::jsonb)
from public.historico_deteccoes h
where propriedade_id = p_propriedade
and (p_animal is null or animal_id = p_animal)
and (p_zona is null or zona_id = p_zona)
and (p_inicio is null or instante_referencia >= p_inicio)
and (p_fim is null or instante_referencia < p_fim);
$$;
revoke all on function public.exportar_deteccoes(uuid,uuid,uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.exportar_deteccoes(uuid,uuid,uuid,timestamptz,timestamptz) to authenticated;
