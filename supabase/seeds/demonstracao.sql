-- Carga sintética Argos. Executar manualmente como administrador.
-- Preserva os registros existentes. Cadastros, histórico e pesagens usam IDs estáveis.
-- Reexecuções acrescentam apenas um novo lote de leituras recentes por minuto.
begin;
do $seed$
declare
  p uuid := '8da8c584-e51b-4b99-808d-8cf55cee7674';
  marca text := 'DEMO-ARGOS-20261116';
  base timestamptz := now();
  dia date := (now() at time zone 'America/Sao_Paulo')::date;
  nomes text[] := array['Curral 03','Bebedouro','Curral 01','Pasto Norte','Área de descanso','Pasto Sul'];
  i integer;
  a uuid; t uuid; r uuid; z uuid; v uuid;
begin
  perform pg_advisory_xact_lock(hashtext(marca || p::text));
  if not exists(select 1 from public.propriedades where id=p and nome='Fazenda Experimental') then
    raise exception 'Propriedade de destino não corresponde à carga revisada.';
  end if;
  for i in 1..6 loop
    r := md5(marca || p::text || 'receptor' || i)::uuid;
    z := md5(marca || p::text || 'zona' || i)::uuid;
    insert into public.dispositivos(id,propriedade_id,codigo,nome,tipo,versao_firmware)
    values(r,p,'DEMO-R' || lpad(i::text,2,'0'),'DEMO · ' || nomes[i],'receptor','simulado')
    on conflict(id) do nothing;
    insert into public.zonas(id,propriedade_id,receptor_id,nome,descricao,ativa)
    values(z,p,r,'DEMO · ' || nomes[i],'Zona fictícia para apresentação acadêmica. Sem localização física medida.',true)
    on conflict(id) do nothing;
  end loop;
  for i in 1..48 loop
    a := md5(marca || p::text || 'animal' || i)::uuid;
    t := md5(marca || p::text || 'transmissor' || i)::uuid;
    v := md5(marca || p::text || 'vinculo' || i)::uuid;
    insert into public.animais(id,propriedade_id,identificacao,sexo,categoria,raca,data_nascimento,origem,lote,observacoes)
    values(a,p,'DEMO-' || lpad(i::text,3,'0'),case when i%3=0 then 'macho' else 'femea' end,
      case when i%4=0 then 'Novilho' else 'Adulto' end,
      (array['Nelore','Angus','Girolando','Brahman'])[1+i%4],date '2026-11-16'-(400+i*13),
      'Demonstração acadêmica','DEMO - Lote ' || (1+(i-1)/12),
      'DADO SIMULADO. Não corresponde a animal real. Carga DEMO-ARGOS-20261116.')
    on conflict(id) do nothing;
    insert into public.dispositivos(id,propriedade_id,codigo,nome,tipo,versao_firmware)
    values(t,p,'DEMO-T' || lpad(i::text,3,'0'),'DEMO · Coleira ' || lpad(i::text,3,'0'),'transmissor','simulado')
    on conflict(id) do nothing;
    insert into public.vinculos(id,propriedade_id,animal_id,transmissor_id,inicio_em)
    values(v,p,a,t,'2026-10-12T00:00:00-03:00')
    on conflict(id) do nothing;
  end loop;

  -- 30 dias, 44 animais, três detecções por dia. Quatro animais nunca detectados.
  insert into public.deteccoes(propriedade_id,transmissor_id,receptor_id,zona_id,vinculo_id,
    evento_id,rssi_dbm,bateria_percentual,detectado_em,recebido_no_gateway_em,recebido_em)
  select p,md5(marca||p::text||'transmissor'||n)::uuid,
    md5(marca||p::text||'receptor'||(1+(n+d+h)%4))::uuid,
    md5(marca||p::text||'zona'||(1+(n+d+h)%4))::uuid,
    md5(marca||p::text||'vinculo'||n)::uuid,
    marca||':historico:'||n||':'||d||':'||h, -45-(n+d+h)%40, 55+(n+d)%40,
    instante,instante + case when n%10=0 then interval '2 hours' else interval '3 seconds' end,
    instante + case when n%10=0 then interval '3 hours' else interval '8 seconds' end
  from generate_series(1,44) n cross join generate_series(1,30) d cross join generate_series(0,2) h
  cross join lateral (select timestamptz '2026-11-16T06:00:00-03:00' - d*interval '1 day' - h*interval '4 hours' as instante) x
  on conflict(receptor_id,evento_id) do nothing;

  -- Receptor 5 tem comunicação antiga; receptor 6 aguarda a primeira leitura.
  insert into public.deteccoes(propriedade_id,transmissor_id,receptor_id,zona_id,vinculo_id,evento_id,
    rssi_dbm,bateria_percentual,detectado_em,recebido_no_gateway_em,recebido_em)
  values(p,md5(marca||p::text||'transmissor41')::uuid,md5(marca||p::text||'receptor5')::uuid,
    md5(marca||p::text||'zona5')::uuid,md5(marca||p::text||'vinculo41')::uuid,
    marca||':comunicacao-antiga',-76,61,base-interval '6 hours',base-interval '6 hours'+interval '2 seconds',base-interval '6 hours'+interval '5 seconds')
  on conflict(receptor_id,evento_id) do nothing;

  -- 40 animais recentes, dois sem zona. Oito leituras concorrentes com RSSI mais fraco.
  insert into public.deteccoes(propriedade_id,transmissor_id,receptor_id,zona_id,vinculo_id,evento_id,
    rssi_dbm,bateria_percentual,detectado_em,recebido_no_gateway_em,recebido_em)
  select p,md5(marca||p::text||'transmissor'||n)::uuid,
    md5(marca||p::text||'receptor'||(1+(n-1+concorrente)%4))::uuid,
    case when n>38 then null else md5(marca||p::text||'zona'||(1+(n-1+concorrente)%4))::uuid end,
    md5(marca||p::text||'vinculo'||n)::uuid,
    marca||':recente:'||to_char(base at time zone 'UTC','YYYYMMDDHH24MI')||':'||n||':'||concorrente,
    case when concorrente=1 then -95 else -45-n%25 end,70+n%25,
    base-interval '60 seconds'-n*interval '1 second'-concorrente*interval '1 second',
    base-interval '58 seconds'-n*interval '1 second'-concorrente*interval '1 second',
    base-interval '55 seconds'-n*interval '1 second'-concorrente*interval '1 second'
  from generate_series(1,40) n cross join generate_series(0,1) concorrente
  where concorrente=0 or n<=8
  on conflict(receptor_id,evento_id) do nothing;

  -- Atualiza somente os receptores sintéticos com a comunicação efetivamente inserida.
  update public.dispositivos d set ultima_comunicacao_em=x.instante
  from (select receptor_id,max(recebido_no_gateway_em) instante from public.deteccoes
    where propriedade_id=p and evento_id like marca||':%' group by receptor_id) x
  where d.id=x.receptor_id and d.propriedade_id=p and d.codigo like 'DEMO-R%';

  insert into public.pesagens(animal_id,propriedade_id,data_pesagem,peso_kg)
  select md5(marca||p::text||'animal'||n)::uuid,p,date '2026-11-16'-(28-s*7),
    280+n*4+s*(2+n%4)
  from generate_series(1,48) n cross join generate_series(0,4) s
  on conflict(animal_id,data_pesagem) do nothing;

  for i in 1..8 loop
    insert into public.alertas(id,propriedade_id,dispositivo_id,tipo,titulo,descricao,prioridade,estado,
      criado_em,lido_em,resolvido_em,origem_evento)
    values(md5(marca||p::text||'alerta'||i)::uuid,p,md5(marca||p::text||'receptor'||(1+(i-1)%6))::uuid,
      'demonstracao_operacional',
      'DEMO · '||(array['Sincronização de lote concluída','Leitura rejeitada no ensaio','Receptor sem leitura recente','Aguardando primeira leitura'])[1+(i-1)%4],
      'Ocorrência SIMULADA para demonstrar a central de avisos. Não indica falha real de hardware ou de rede.',
      (array['baixa','media','alta','critica'])[1+(i-1)%4],
      case when i<=4 then 'novo' when i<=6 then 'lido' else 'resolvido' end,
      base-i*interval '2 hours',case when i>4 then base-interval '30 minutes' end,
      case when i>6 then base-interval '10 minutes' end,marca||':alerta:'||i)
    on conflict(id) do nothing;
  end loop;
end;
$seed$;
commit;
