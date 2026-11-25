-- Ensaio transacional isolado; nada é persistido nem toca tabelas operacionais.
begin;
do $$
declare
  run uuid := gen_random_uuid();
  prop uuid;
begin
  select propriedade_id into prop from public.argos_demo_execucoes limit 1;
  if prop is null then raise exception 'Popular uma execução de demonstração primeiro'; end if;
  if has_table_privilege('anon','public.argos_demo_medicoes','SELECT')
    or has_table_privilege('authenticated','public.argos_demo_medicoes','SELECT')
    or has_function_privilege('anon','public.argos_monitor_snapshot(uuid,uuid,text,text)','EXECUTE')
    then raise exception 'Acesso indevido'; end if;
  if exists(select 1 from information_schema.triggers where event_object_table like 'argos_demo_%')
    then raise exception 'Trigger inesperado na demonstração'; end if;
  insert into public.argos_demo_execucoes(id,propriedade_id,manifesto)
    values(run,prop,'{"origem":"synthetic","teste":"rollback"}');
  insert into public.argos_demo_medicoes(execucao_id,propriedade_id,sessao,passo,observado_em,dados)
    values(run,prop,0,0,now(),'{"origem":"synthetic"}');
  begin
    insert into public.argos_demo_medicoes(execucao_id,propriedade_id,sessao,passo,observado_em,origem,dados)
      values(run,prop,0,1,now(),'real','{"origem":"real"}');
    raise exception 'Origem real indevidamente aceita';
  exception when check_violation then null; end;
  begin
    insert into public.argos_demo_medicoes(execucao_id,propriedade_id,sessao,passo,observado_em,dados)
      values(run,gen_random_uuid(),0,1,now(),'{"origem":"synthetic"}');
    raise exception 'Mistura de propriedade indevidamente aceita';
  exception when foreign_key_violation then null; end;
  delete from public.argos_demo_execucoes where id=run and propriedade_id=prop;
  if exists(select 1 from public.argos_demo_medicoes where execucao_id=run)
    then raise exception 'Limpeza por execução não removeu seus próprios filhos'; end if;
end $$;
rollback;
select 'isolamento, origem, privilégios e limpeza aprovados; rollback concluído' resultado;
