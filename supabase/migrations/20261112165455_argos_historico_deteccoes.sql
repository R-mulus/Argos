alter table public.deteccoes add column recebido_no_gateway_em timestamptz;
comment on column public.deteccoes.recebido_no_gateway_em is
  'Primeira recepção pelo worker. Nulo em registros de versões anteriores.';

create view public.historico_deteccoes with (security_invoker = true) as
select d.id, d.propriedade_id, d.evento_id, d.transmissor_id, d.receptor_id,
       r.codigo as receptor_codigo, d.zona_id, z.nome as zona_nome,
       d.vinculo_id, a.id as animal_id, a.identificacao as animal_identificacao,
       a.sexo as animal_sexo, d.rssi_dbm, d.bateria_percentual,
       d.detectado_em, d.recebido_no_gateway_em, d.recebido_em,
       coalesce(d.detectado_em, d.recebido_no_gateway_em) as instante_referencia
from public.deteccoes d
join public.dispositivos r on (r.id, r.propriedade_id) = (d.receptor_id, d.propriedade_id)
left join public.zonas z on (z.id, z.propriedade_id) = (d.zona_id, d.propriedade_id)
left join public.vinculos v on (v.id, v.propriedade_id, v.transmissor_id) =
                               (d.vinculo_id, d.propriedade_id, d.transmissor_id)
left join public.animais a on (a.id, a.propriedade_id) = (v.animal_id, v.propriedade_id);

revoke all on public.historico_deteccoes from public, anon, authenticated;
grant select on public.historico_deteccoes to authenticated;
create index deteccoes_historico_idx on public.deteccoes
  (propriedade_id, coalesce(detectado_em, recebido_no_gateway_em) desc nulls last, recebido_em desc, id);
