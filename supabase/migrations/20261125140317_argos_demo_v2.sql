-- Demonstração isolada: nenhum trigger ou vínculo com eventos/filas operacionais.
create table public.argos_demo_execucoes (
  id uuid primary key,
  propriedade_id uuid not null references public.propriedades(id),
  origem text not null default 'synthetic' check (origem = 'synthetic'),
  manifesto jsonb not null,
  criado_em timestamptz not null default now(),
  unique (id, propriedade_id)
);
create table public.argos_demo_medicoes (
  execucao_id uuid not null,
  propriedade_id uuid not null,
  sessao integer not null check (sessao >= 0),
  passo integer not null check (passo >= 0),
  observado_em timestamptz not null,
  origem text not null default 'synthetic' check (origem = 'synthetic'),
  dados jsonb not null check (dados->>'origem' = 'synthetic'),
  primary key (execucao_id, sessao, passo),
  foreign key (execucao_id, propriedade_id) references public.argos_demo_execucoes(id, propriedade_id) on delete cascade
);
create index argos_demo_execucoes_propriedade on public.argos_demo_execucoes(propriedade_id);
create index argos_demo_medicoes_execucao_propriedade on public.argos_demo_medicoes(execucao_id, propriedade_id);
alter table public.argos_demo_execucoes enable row level security;
alter table public.argos_demo_medicoes enable row level security;
revoke all on public.argos_demo_execucoes, public.argos_demo_medicoes from anon, authenticated;
grant all on public.argos_demo_execucoes, public.argos_demo_medicoes to service_role;

create index argos_loc_monitor_tempo on public.argos_localizacoes(propriedade_id, transmissor_id, observado_em desc, calculado_em desc);
create index argos_monitor_recebimento on public.deteccoes(propriedade_id, transmissor_id, recebido_em desc);

-- Snapshot consistente em uma única ida ao banco. Somente o servidor local chama.
create function public.argos_monitor_snapshot(p_propriedade uuid, p_transmissor uuid default null,
  p_referencia text default null, p_calibracao text default null)
returns jsonb language sql stable security invoker set search_path = public as $$
with tx as (
  select id,codigo,nome from dispositivos
  where propriedade_id=p_propriedade and tipo='transmissor'
    and (p_transmissor is null or id=p_transmissor)
  order by (codigo='TX-0001') desc,codigo,id limit 1
), trilha as (
  select l.* from argos_localizacoes l join tx on tx.id=l.transmissor_id
  where l.propriedade_id=p_propriedade and l.origem in ('real','experimental')
    and l.observado_em is not null and l.observado_em <= now() + interval '5 seconds'
    and (p_referencia is null or l.referencial_versao=p_referencia)
    and (p_calibracao is null or l.calibracao_sha256=p_calibracao)
  order by l.observado_em desc,l.calculado_em desc,l.evento_id desc limit 90
), pacote as (
  select d.evento_id,d.detectado_em,d.recebido_em from deteccoes d join tx on tx.id=d.transmissor_id
  where d.propriedade_id=p_propriedade order by d.recebido_em desc,d.id desc limit 1
), receptores as (
  select p.*,d.codigo,d.nome,r.rssi_dbm,r.detectado_em medido_em,r.recebido_em,r.evento_id
  from argos_posicoes_receptores p join dispositivos d on d.id=p.receptor_id and d.propriedade_id=p.propriedade_id
  left join lateral (select rssi_dbm,detectado_em,recebido_em,evento_id from deteccoes
    where propriedade_id=p_propriedade and receptor_id=p.receptor_id and transmissor_id=(select id from tx)
    order by detectado_em desc nulls last,recebido_em desc,id desc limit 1) r on true
  where p.propriedade_id=p_propriedade
), jobs as (
  select estado,count(*) quantidade,min(disponivel_em) primeiro_pendente
  from argos_iot_jobs where propriedade_id=p_propriedade and transmissor_id=(select id from tx)
    and estado='pendente' group by estado
)
select jsonb_build_object(
 'server_time',now(),'propriedade',(select nome from propriedades where id=p_propriedade),
 'transmissor',(select to_jsonb(tx) from tx),
 'posicao',(select to_jsonb(t) from trilha t order by observado_em desc,calculado_em desc,evento_id desc limit 1),
 'trilha',coalesce((select jsonb_agg(to_jsonb(t) order by observado_em,calculado_em,evento_id) from trilha t),'[]'::jsonb),
 'receptores',coalesce((select jsonb_agg(to_jsonb(r) order by codigo) from receptores r),'[]'::jsonb),
 'ultimo_pacote_em',(select recebido_em from pacote),'ultima_medicao_em',(select detectado_em from pacote),
 'evento_rssi',(select evento_id from pacote),'fila',coalesce((select to_jsonb(j) from jobs j),'{}'::jsonb),
 'somente_leitura',true,'origem','operacional');
$$;
revoke all on function public.argos_monitor_snapshot(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.argos_monitor_snapshot(uuid,uuid,text,text) to service_role;
