begin;
create function public.argos_ml_analise(p_animal_id uuid, p_inicio timestamptz,
 p_fim timestamptz, p_periodo text) returns jsonb
language plpgsql stable security invoker set search_path = '' set timezone = 'UTC' as $$
declare prop uuid; result jsonb;
begin
 if p_inicio is null or p_fim is null or not isfinite(p_inicio) or not isfinite(p_fim)
 or p_fim <= p_inicio or p_fim-p_inicio > interval '31 days'
 or p_periodo is null or p_periodo not in ('dia','semana','mes') then
   raise exception 'Periodo invalido (maximo 31 dias)' using errcode='22023';
 end if;
 select a.propriedade_id into prop from public.animais a join public.propriedades p
 on p.id=a.propriedade_id where a.id=p_animal_id and p.usuario_id=(select auth.uid());
 if prop is null then raise exception 'Animal indisponivel' using errcode='42501'; end if;
 with raw as materialized (
   select l.*,
    (l.x_m between -1000000 and 1000000 and l.y_m between -1000000 and 1000000
     and l.erro_residual_m between 0 and 15 and l.receptores_utilizados >= 3
     and nullif(l.referencial_versao,'') is not null
     and l.calibracao_sha256 ~ '^[a-f0-9]{64}$' and l.origem is not null
     and (select count(*) from public.vinculos v where v.propriedade_id=prop
       and v.transmissor_id=l.transmissor_id and v.animal_id=p_animal_id
       and v.inicio_em<=l.observado_em and (v.fim_em is null or l.observado_em<v.fim_em))=1) as valid
   from public.argos_localizacoes l where l.propriedade_id=prop and l.animal_id=p_animal_id
   and l.observado_em>=p_inicio-interval '120 seconds' and l.observado_em<p_fim+interval '120 seconds'
 ), ordered as (
   select r.*, lag(observado_em) over w as t0, lag(x_m) over w as x0, lag(y_m) over w as y0,
    lag(erro_residual_m) over w as rms0, lag(valid) over w as valid0,
    lag(referencial_versao) over w as ref0, lag(calibracao_sha256) over w as hash0,
    lag(origem) over w as origem0,
    count(*) over (partition by transmissor_id,observado_em) as same_time
   from raw r window w as (partition by transmissor_id order by observado_em,id)
 ), candidates as (
   select *, sqrt(power(x_m-x0,2)+power(y_m-y0,2)) as distance,
    extract(epoch from observado_em-t0) as seconds,
    lag(same_time) over (partition by transmissor_id order by observado_em,id) as previous_same_time
   from ordered
 ), accepted as materialized (
   select *, greatest(t0,p_inicio) as a, least(observado_em,p_fim) as b,
    distance/seconds as speed,
    case when distance/seconds<=0.1 and distance<=3 then 'parado_aparente'
     when distance/seconds>=0.5 and distance>3+rms0+erro_residual_m then 'em_movimento_aparente'
     else 'indeterminado' end as state
   from candidates where valid and valid0 and same_time=1 and previous_same_time=1
    and referencial_versao=ref0 and calibracao_sha256=hash0 and origem=origem0
    and seconds>0 and seconds<=120 and distance/nullif(seconds,0)<=8
    and t0<p_fim and observado_em>p_inicio
    and exists(select 1 from public.vinculos v where v.propriedade_id=prop
      and v.animal_id=p_animal_id and v.transmissor_id=candidates.transmissor_id
      and v.inicio_em<=t0 and (v.fim_em is null or v.fim_em>candidates.observado_em))
 ), intervals as materialized (
   select i.* from accepted i where not exists(select 1 from accepted j
    where j.transmissor_id<>i.transmissor_id and j.a<i.b and i.a<j.b)
 ), ticks as (
   select greatest(t,p_inicio) as a, least(t+step,p_fim) as b from
    (select case when p_periodo='dia' then interval '1 hour' else interval '1 day' end step) s,
    lateral generate_series(date_trunc(case when p_periodo='dia' then 'hour' else 'day' end,p_inicio),p_fim,s.step) t
   where t<p_fim
 ), buckets as (
   select t.a,t.b, coalesce(sum(extract(epoch from least(i.b,t.b)-greatest(i.a,t.a))) filter(where i.id is not null),0) as covered,
    sum(i.speed*extract(epoch from least(i.b,t.b)-greatest(i.a,t.a))) as distance,
    coalesce(sum(extract(epoch from least(i.b,t.b)-greatest(i.a,t.a))) filter(where i.state='parado_aparente'),0) as rest,
    coalesce(sum(extract(epoch from least(i.b,t.b)-greatest(i.a,t.a))) filter(where i.state='em_movimento_aparente'),0) as moving,
    coalesce(sum(extract(epoch from least(i.b,t.b)-greatest(i.a,t.a))) filter(where i.state='indeterminado'),0) as uncertain
   from ticks t left join intervals i on i.a<t.b and t.a<i.b group by t.a,t.b
 ), labels as materialized (
   select o.* from public.argos_observacoes_visao o where o.propriedade_id=prop
    and o.animal_id=p_animal_id and o.revisado_em is not null and nullif(btrim(o.revisado_por),'') is not null
    and o.confianca between 0.8 and 1 and o.comportamento in ('parado','comendo','em_movimento','outro')
    and o.observado_em>=p_inicio-interval '120 seconds' and o.observado_em<p_fim+interval '120 seconds'
 ), label_order as (
   select *,lag(observado_em) over w t0,lag(comportamento) over w c0,
    count(*) over(partition by camera_id,observado_em) n
   from labels window w as (partition by camera_id order by observado_em,id)
 ), label_pairs as (
   select *,lag(n) over(partition by camera_id order by observado_em,id) n0 from label_order
 ), label_candidates as materialized (
   select *,greatest(t0,p_inicio) a,least(observado_em,p_fim) b from label_pairs
   where n=1 and n0=1 and comportamento=c0 and observado_em>t0
    and observado_em-t0<=interval '120 seconds' and t0<p_fim and observado_em>p_inicio
 ), label_intervals as materialized (
   -- Conservador: nem soma duplicada nem escolha arbitrária entre câmeras simultâneas.
   select i.* from label_candidates i where not exists(select 1 from label_candidates j
    where j.camera_id<>i.camera_id and j.a<i.b and i.a<j.b)
    and not exists(select 1 from labels j where j.camera_id<>i.camera_id
      and j.observado_em between i.a and i.b and j.comportamento<>i.comportamento)
 ), behavior_buckets as (
   select t.a,t.b,i.comportamento,
    sum(extract(epoch from least(i.b,t.b)-greatest(i.a,t.a))) as seconds
   from ticks t join label_intervals i on i.a<t.b and t.a<i.b group by t.a,t.b,i.comportamento
 ), behavior as (
   select coalesce(sum(extract(epoch from b-a)),0) covered,
    sum(extract(epoch from b-a)) filter(where comportamento='parado') rest,
    sum(extract(epoch from b-a)) filter(where comportamento='comendo') eating,
    sum(extract(epoch from b-a)) filter(where comportamento='em_movimento') moving,
    sum(extract(epoch from b-a)) filter(where comportamento='outro') other from label_intervals
 ), total as (
   select sum(covered) covered,sum(distance) distance,sum(rest) rest,sum(moving) moving,sum(uncertain) uncertain from buckets
 ), predictions as materialized (
   select p.* from public.argos_predicoes p where p.propriedade_id=prop and p.animal_id=p_animal_id
    and p.observado_em>=p_inicio and p.observado_em<p_fim and p.previsto_para>p.observado_em
 ), latest as (select * from predictions order by observado_em desc,id desc limit 1)
 select jsonb_build_object(
  'resumo',jsonb_build_object('distancia_estimada_m',total.distance,'velocidade_media_estimada_m_s',total.distance/nullif(total.covered,0),
   'segundos_repouso_aparente',case when total.covered>0 then total.rest end,
   'segundos_movimento_aparente',case when total.covered>0 then total.moving end,
   'cobertura_percentual',100*total.covered/extract(epoch from p_fim-p_inicio),
   'localizacoes',(select count(*) from raw where valid and observado_em>=p_inicio and observado_em<p_fim),
   'rms_medio_m',(select avg(erro_residual_m) from raw where valid and observado_em>=p_inicio and observado_em<p_fim)),
  'movimentacao',jsonb_build_object('origem','derivado_rssi','periodo',p_periodo,'pontos',
   (select jsonb_agg(jsonb_build_object('inicio',a,'fim',b,'distancia_estimada_m',distance,
    'velocidade_media_estimada_m_s',distance/nullif(covered,0),'cobertura_percentual',100*covered/extract(epoch from b-a),
    'segundos_observados',covered,'segundos_repouso_aparente',rest,'segundos_movimento_aparente',moving,
    'segundos_indeterminados',uncertain,
    'movimento_aparente',jsonb_build_object('parado_aparente',100*rest/nullif(covered,0),
     'em_movimento_aparente',100*moving/nullif(covered,0),'indeterminado',100*uncertain/nullif(covered,0))) order by a) from buckets)),
  'comportamentos',jsonb_build_object('origem','observado_validado','disponivel',behavior.covered>0,
   'cobertura_percentual',100*behavior.covered/extract(epoch from p_fim-p_inicio),
   'percentuais',jsonb_build_object('parado',100*coalesce(behavior.rest,0)/nullif(behavior.covered,0),
    'comendo',100*coalesce(behavior.eating,0)/nullif(behavior.covered,0),
    'em_movimento',100*coalesce(behavior.moving,0)/nullif(behavior.covered,0),'outro',100*coalesce(behavior.other,0)/nullif(behavior.covered,0))),
  'qualidade',jsonb_build_object('versao_contrato',1,'segundos_sem_cobertura',extract(epoch from p_fim-p_inicio)-total.covered,
   'segundos_indeterminados_observados',total.uncertain,'velocidade_maxima_estimada_m_s',(select max(speed) from intervals),
   'localizacoes_excluidas',(select count(*) from raw where valid is not true and observado_em>=p_inicio and observado_em<p_fim),
   'receptores_minimos',(select min(receptores_utilizados) from raw where valid and observado_em>=p_inicio and observado_em<p_fim),
   'referenciais',(select coalesce(jsonb_agg(distinct referencial_versao),'[]') from raw where valid),
   'origens',(select coalesce(jsonb_agg(distinct origem),'[]') from raw where valid),
   'observacoes_confiaveis',(select count(*) from labels where observado_em>=p_inicio and observado_em<p_fim)),
  'comportamentos_temporais',(select coalesce(jsonb_agg(jsonb_build_object('inicio',a,'fim',b,
   'comportamento',comportamento,'segundos_observados',seconds) order by a,comportamento),'[]') from behavior_buckets),
  'previsoes',jsonb_build_object('quantidade',(select count(*) from predictions),'disponivel',exists(select 1 from predictions),
   'observado_em',(select observado_em from latest),'previsto_para',(select previsto_para from latest),
   'horizonte_segundos',(select extract(epoch from previsto_para-observado_em) from latest),
   'modelo_versao',(select modelo_versao from latest),'origem',(select origem from latest),
   'referencial_versao',(select referencial_versao from latest),'desempenho_validado',null)
 ) into result from total cross join behavior;
 return result;
end $$;
revoke all on function public.argos_ml_analise(uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.argos_ml_analise(uuid,timestamptz,timestamptz,text) to authenticated;
comment on function public.argos_ml_analise(uuid,timestamptz,timestamptz,text) is
 'KPIs v1 SECURITY INVOKER. Estimativas RSSI; UTC, [inicio,fim), lacuna maxima 120s. Nao valida modelos.';
commit;
