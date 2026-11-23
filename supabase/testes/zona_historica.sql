-- Teste das migrações 20261122184335 (zona histórica) e 20261122184338 (previsão sem comportamento)
-- e do script supabase/manutencao/20261122_preencher_zona_historica.sql, em PostgreSQL local, nunca
-- no projeto hospedado. Roda numa transação desfeita no final.
--   psql -v ON_ERROR_STOP=1 -d <banco_local_com_as_migracoes> -f supabase/testes/zona_historica.sql
begin;

insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
insert into public.propriedades(id, usuario_id, nome) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Fazenda A');
insert into public.dispositivos(id, propriedade_id, codigo, tipo, status) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'RX-1', 'receptor', 'ativo'),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'RX-2', 'receptor', 'ativo'),
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'RX-3', 'receptor', 'ativo'),
  ('a0000000-0000-4000-8000-000000000009', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'TX-1', 'transmissor', 'ativo');
-- RX-1: zona ativa criada há 1 h. RX-2: zona inativa. RX-3: sem zona.
insert into public.zonas(id, propriedade_id, receptor_id, nome, ativa, updated_at) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a0000000-0000-4000-8000-000000000001', 'Piquete 1', true, now() - interval '1 hour'),
  ('a1000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a0000000-0000-4000-8000-000000000002', 'Piquete 2', false, now() - interval '1 hour');
-- O trigger de updated_at não roda em insert; o valor acima simula a zona criada há 1 h.

create temp table casos(evento text, receptor uuid, detectado timestamptz, zona_informada uuid, esperada uuid);
insert into casos values
  ('depois-da-zona', 'a0000000-0000-4000-8000-000000000001', now() - interval '10 minutes', null, 'a1000000-0000-4000-8000-000000000001'),
  ('antes-da-zona',  'a0000000-0000-4000-8000-000000000001', now() - interval '2 hours',    null, null),
  ('sem-horario',    'a0000000-0000-4000-8000-000000000001', null,                          null, null),
  ('zona-inativa',   'a0000000-0000-4000-8000-000000000002', now() - interval '10 minutes', null, null),
  ('sem-zona',       'a0000000-0000-4000-8000-000000000003', now() - interval '10 minutes', null, null),
  -- Zona já informada pelo worker nunca é sobrescrita.
  ('informada',      'a0000000-0000-4000-8000-000000000001', now() - interval '10 minutes',
   'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001');

insert into public.deteccoes(propriedade_id, transmissor_id, receptor_id, evento_id, rssi_dbm, detectado_em, zona_id)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000009', receptor, evento, -60, detectado, zona_informada
from casos;

do $$
declare r record;
begin
  for r in select c.evento, c.esperada, d.zona_id from casos c join public.deteccoes d on d.evento_id = c.evento loop
    assert r.zona_id is not distinct from r.esperada,
      format('caso %s: zona %s, esperada %s', r.evento, r.zona_id, r.esperada);
  end loop;
end $$;

-- Zona editada depois da captura: a leitura atrasada que chega agora não recebe zona.
update public.zonas set nome = 'Piquete 1 renomeado' where id = 'a1000000-0000-4000-8000-000000000001';
insert into public.deteccoes(propriedade_id, transmissor_id, receptor_id, evento_id, rssi_dbm, detectado_em)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000009',
        'a0000000-0000-4000-8000-000000000001', 'atrasada-apos-edicao', -60, now() - interval '5 minutes');
-- O updated_at da zona passa a ser now() (início da transação); a captura de 5 min atrás é anterior.
do $$ begin
  assert (select zona_id from public.deteccoes where evento_id = 'atrasada-apos-edicao') is null,
    'leitura anterior à edição da zona não pode receber a zona atual';
end $$;

-- Preenchimento retroativo: só as leituras que o trigger também aceitaria.
alter table public.zonas disable trigger zonas_atualizar_updated_at;
update public.zonas set updated_at = now() - interval '1 hour' where id = 'a1000000-0000-4000-8000-000000000001';
alter table public.zonas enable trigger zonas_atualizar_updated_at;
alter table public.deteccoes disable trigger deteccoes_atribuir_zona_historica;
insert into public.deteccoes(propriedade_id, transmissor_id, receptor_id, evento_id, rssi_dbm, detectado_em)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000009',
   'a0000000-0000-4000-8000-000000000001', 'legado-valido', -60, now() - interval '10 minutes'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000009',
   'a0000000-0000-4000-8000-000000000001', 'legado-anterior', -60, now() - interval '3 hours'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000009',
   'a0000000-0000-4000-8000-000000000001', 'legado-sem-horario', -60, null);
alter table public.deteccoes enable trigger deteccoes_atribuir_zona_historica;
\ir ../manutencao/20261122_preencher_zona_historica.sql
do $$ begin
  assert (select zona_id from public.deteccoes where evento_id = 'legado-valido') = 'a1000000-0000-4000-8000-000000000001',
    'preenchimento deveria atribuir zona à leitura posterior à zona';
  assert (select zona_id from public.deteccoes where evento_id = 'legado-anterior') is null,
    'preenchimento não pode atribuir zona anterior à criação';
  assert (select zona_id from public.deteccoes where evento_id = 'legado-sem-horario') is null,
    'preenchimento não pode atribuir zona sem horário';
end $$;

-- Previsão de posição sem comportamento (modelo de regressão).
insert into public.argos_predicoes(id, propriedade_id, animal_id, evento_id, observado_em, previsto_para,
  atual_x_m, atual_y_m, proximo_x_m, proximo_y_m, comportamento, confianca, probabilidades, modelo_versao, criado_em)
values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'ev-1', now(),
  now() + interval '5 minutes', 1, 2, 3, 4, null, null, null, 'gru-teste', now());

-- Usuário comum não executa a função do trigger.
do $$ begin
  assert not has_function_privilege('authenticated', 'public.argos_atribuir_zona_historica()', 'execute'),
    'authenticated não deveria executar a função do trigger';
end $$;

-- Ponta a ponta: leitura recente com vínculo e sem zona informada (como grava o worker/) entra na
-- contagem da zona pelo resumo_monitoramento.
insert into public.animais(id, propriedade_id, identificacao) values
  ('a2000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A001');
insert into public.vinculos(id, propriedade_id, animal_id, transmissor_id, inicio_em) values
  ('a3000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000009', now() - interval '2 hours');
insert into public.deteccoes(propriedade_id, transmissor_id, receptor_id, evento_id, rssi_dbm, detectado_em, vinculo_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000009',
        'a0000000-0000-4000-8000-000000000001', 'ao-vivo', -55, now() - interval '1 minute',
        'a3000000-0000-4000-8000-000000000001');
do $$
declare resumo jsonb := public.resumo_monitoramento('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
begin
  assert (resumo->>'recentes')::int = 1 and (resumo->>'recentes_sem_zona')::int = 0,
    'A001 deveria estar recente e com zona: ' || resumo::text;
  assert exists (select 1 from jsonb_array_elements(resumo->'zonas') z
                 where z->>'id' = 'a1000000-0000-4000-8000-000000000001' and (z->>'quantidade')::int = 1),
    'Piquete 1 deveria contar 1 animal: ' || (resumo->'zonas')::text;
end $$;

\echo 'zona_historica.sql: todos os casos passaram'
rollback;
