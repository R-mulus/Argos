-- RF06: avisos automáticos de comunicação, gerados no banco a cada 5 minutos (pg_cron).
-- Aplicada no projeto hospedado em 18/11/2026 (versão 20261118113726 do histórico).
--
-- receptor_sem_leitura: receptor ativo que se comunicou nas últimas 24 h, mas não nos últimos 15 min.
--   Um aviso por queda (origem = receptor + horário da última comunicação). Sem coleiras por perto,
--   um receptor ligado também fica sem leituras: a descrição diz isso.
-- coleira_sem_deteccao: coleira ativa vinculada a um animal, sem detecção há mais de 30 min (e com
--   comunicação nas últimas 24 h), enquanto algum receptor real da propriedade se comunica. Se nenhum
--   receptor se comunica, o problema é da infraestrutura e o aviso do receptor já cobre.
-- Quando o dispositivo volta a se comunicar, os avisos abertos dele são encerrados como resolvidos.
-- Dispositivos de demonstração (versao_firmware = 'simulado') ficam de fora: as leituras recentes da
-- carga de demonstração envelhecem em minutos e gerariam avisos falsos.

create extension if not exists pg_cron;

create or replace function public.argos_verificar_comunicacao()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  criados integer;
  coleiras integer;
begin
  insert into public.alertas (propriedade_id, dispositivo_id, tipo, titulo, descricao, prioridade, origem_evento)
  select d.propriedade_id, d.id, 'receptor_sem_leitura',
    'Receptor ' || d.codigo || ' sem leituras recentes',
    'A última leitura chegou em ' ||
      to_char(d.ultima_comunicacao_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') ||
      '. Confira energia, Wi-Fi e conexão com o broker. Sem coleiras por perto, o receptor também fica sem leituras.',
    'alta',
    'receptor_sem_leitura:' || d.id || ':' || to_char(d.ultima_comunicacao_em at time zone 'UTC', 'YYYYMMDDHH24MISS')
  from public.dispositivos d
  where d.tipo = 'receptor' and d.status = 'ativo' and coalesce(d.versao_firmware, '') <> 'simulado'
    and d.ultima_comunicacao_em between now() - interval '24 hours' and now() - interval '15 minutes'
  on conflict (propriedade_id, origem_evento) do nothing;
  get diagnostics criados = row_count;

  insert into public.alertas (propriedade_id, dispositivo_id, animal_id, tipo, titulo, descricao, prioridade, origem_evento)
  select d.propriedade_id, d.id, v.animal_id, 'coleira_sem_deteccao',
    'Coleira ' || d.codigo || ' (' || a.identificacao || ') sem detecção',
    'Nenhum receptor detecta esta coleira desde ' ||
      to_char(d.ultima_comunicacao_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') ||
      ', embora haja receptores comunicando. O animal pode estar fora do alcance ou a coleira pode estar sem bateria.',
    'media',
    'coleira_sem_deteccao:' || d.id || ':' || to_char(d.ultima_comunicacao_em at time zone 'UTC', 'YYYYMMDDHH24MISS')
  from public.dispositivos d
  join public.vinculos v on v.transmissor_id = d.id and v.propriedade_id = d.propriedade_id
    and v.inicio_em <= now() and (v.fim_em is null or v.fim_em > now())
  join public.animais a on a.id = v.animal_id and a.propriedade_id = v.propriedade_id
  where d.tipo = 'transmissor' and d.status = 'ativo' and coalesce(d.versao_firmware, '') <> 'simulado'
    and d.ultima_comunicacao_em between now() - interval '24 hours' and now() - interval '30 minutes'
    and exists (
      select 1 from public.dispositivos r
      where r.propriedade_id = d.propriedade_id and r.tipo = 'receptor' and r.status = 'ativo'
        and coalesce(r.versao_firmware, '') <> 'simulado'
        and r.ultima_comunicacao_em > now() - interval '5 minutes')
  on conflict (propriedade_id, origem_evento) do nothing;
  get diagnostics coleiras = row_count;

  update public.alertas al set
    estado = 'resolvido',
    lido_em = coalesce(al.lido_em, now()),
    resolvido_em = now(),
    descricao = coalesce(al.descricao, '') || ' Comunicação restabelecida; aviso encerrado automaticamente.'
  from public.dispositivos d
  where al.dispositivo_id = d.id and al.propriedade_id = d.propriedade_id
    and al.tipo in ('receptor_sem_leitura', 'coleira_sem_deteccao') and al.estado <> 'resolvido'
    and d.ultima_comunicacao_em > al.criado_em;

  return criados + coleiras;
end;
$$;

revoke all on function public.argos_verificar_comunicacao() from public, anon, authenticated;

select cron.schedule('argos-verificar-comunicacao', '*/5 * * * *', 'select public.argos_verificar_comunicacao()');
