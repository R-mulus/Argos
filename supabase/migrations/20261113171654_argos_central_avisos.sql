alter table public.alertas add column origem_evento text;
alter table public.alertas add constraint alertas_origem_unica unique (propriedade_id, origem_evento);

create function public.atualizar_estado_alerta(p_propriedade uuid, p_alerta uuid, p_estado text)
returns setof public.alertas
language plpgsql security invoker set search_path = '' as $$
begin
  if p_estado not in ('lido','resolvido') or p_estado is null then
    raise exception 'Estado de alerta inválido.' using errcode='23514';
  end if;
  return query update public.alertas set
    estado = case when estado = 'resolvido' then estado else p_estado end,
    lido_em = coalesce(lido_em, now()),
    resolvido_em = case when p_estado = 'resolvido' then coalesce(resolvido_em, now()) else resolvido_em end
  where id = p_alerta and propriedade_id = p_propriedade
  returning *;
end;
$$;
revoke all on function public.atualizar_estado_alerta(uuid,uuid,text) from public, anon;
grant execute on function public.atualizar_estado_alerta(uuid,uuid,text) to authenticated;
