-- Teste da migração 20261118113632_argos_referencia_espacial.sql em um PostgreSQL local, nunca no
-- projeto hospedado. Roda dentro de uma transação desfeita no final.
--   psql -v ON_ERROR_STOP=1 -d <banco_local_com_as_migracoes> -f supabase/testes/referencia_espacial.sql
-- O banco local precisa dos papéis anon/authenticated/service_role e de auth.uid() lendo
-- request.jwt.claim.sub, como no Supabase.
begin;

insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.propriedades(id, usuario_id, nome) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Fazenda A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Fazenda B');
insert into public.dispositivos(id, propriedade_id, codigo, tipo, status) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'RX-A', 'receptor', 'ativo'),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'RX-B', 'receptor', 'ativo');
insert into public.zonas(id, propriedade_id, receptor_id, nome, ativa) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'Curral A', true),
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001', 'Curral B', true);
insert into public.animais(id, propriedade_id, identificacao) values
  ('a2000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A-1');

-- Seis estimativas do mesmo animal: a view devolve as cinco mais novas; sem horário fica de fora.
insert into public.argos_localizacoes(id, propriedade_id, transmissor_id, animal_id, evento_id, x_m, y_m,
  erro_residual_m, receptores_utilizados, calculado_em, observado_em)
select gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001', 'ev-' || n, n, n, 1, 3, now(), now() - n * interval '1 minute'
from generate_series(1, 6) n;
insert into public.argos_localizacoes(id, propriedade_id, transmissor_id, animal_id, evento_id, x_m, y_m,
  erro_residual_m, receptores_utilizados, calculado_em, observado_em)
values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001', 'ev-sem-horario', 0, 0, 1, 3, now(), null);

do $$
declare
  falhou boolean;
begin
  -- Restrições de modo.
  begin
    insert into public.argos_referencias_espaciais(propriedade_id, modo, origem_latitude, origem_longitude, planta_url)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'geografico', -18.6, -46.5, 'https://x.example/p.png');
    falhou := false;
  exception when check_violation then falhou := true; end;
  assert falhou, 'modo geografico com planta deveria falhar';

  begin
    insert into public.argos_referencias_espaciais(propriedade_id, modo, planta_url, planta_x_min_m, planta_y_min_m, planta_x_max_m, planta_y_max_m)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'planta', 'http://inseguro.example/p.png', 0, 0, 100, 100);
    falhou := false;
  exception when check_violation then falhou := true; end;
  assert falhou, 'planta sem https deveria falhar';

  -- Geometria: zona de outra propriedade e vértices inválidos.
  begin
    insert into public.argos_geometrias_zonas(zona_id, propriedade_id, pontos)
    values ('b1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[[0,0],[1,0],[0,1]]');
    falhou := false;
  exception when foreign_key_violation then falhou := true; end;
  assert falhou, 'zona de outra propriedade deveria falhar';

  begin
    insert into public.argos_geometrias_zonas(zona_id, propriedade_id, pontos)
    values ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[[0,0],[1,0]]');
    falhou := false;
  exception when raise_exception then falhou := true; end;
  assert falhou, 'geometria com 2 vertices deveria falhar';

  begin
    insert into public.argos_geometrias_zonas(zona_id, propriedade_id, pontos)
    values ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[[0,0],[1,"x"],[0,1]]');
    falhou := false;
  exception when raise_exception then falhou := true; end;
  assert falhou, 'vertice nao numerico deveria falhar';
end $$;

insert into public.argos_referencias_espaciais(propriedade_id, modo, origem_latitude, origem_longitude, azimute_eixo_y_graus)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'geografico', -18.58, -46.51, 15);
insert into public.argos_referencias_espaciais(propriedade_id, modo, planta_url, planta_x_min_m, planta_y_min_m, planta_x_max_m, planta_y_max_m)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'planta', 'https://exemplo.invalid/planta.png', -10, -10, 200, 150);
insert into public.argos_geometrias_zonas(zona_id, propriedade_id, pontos) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[[0,0],[50,0],[50,40],[0,40]]'),
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '[[0,0],[10,0],[0,10]]');

-- Isolamento: o dono da Fazenda A vê somente o que é dela.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
begin
  assert (select count(*) from public.argos_referencias_espaciais) = 1, 'RLS: referencia de outra propriedade visivel';
  assert (select count(*) from public.argos_geometrias_zonas) = 1, 'RLS: geometria de outra propriedade visivel';
  assert (select count(*) from public.argos_localizacoes_recentes) = 5, 'view deve trazer 5 por animal, sem a sem horario';
  assert (select min(x_m) from public.argos_localizacoes_recentes) = 1, 'view deve trazer as mais novas';
  assert not exists (select 1 from public.argos_localizacoes_recentes where evento_id = 'ev-sem-horario'), 'sem horario na view';
end $$;

-- Escrita na propriedade alheia é barrada pelo RLS.
do $$
declare
  falhou boolean;
begin
  begin
    update public.argos_referencias_espaciais set azimute_eixo_y_graus = 90
    where propriedade_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    assert not found, 'RLS: update de outra propriedade alterou linhas';
    insert into public.argos_geometrias_zonas(zona_id, propriedade_id, pontos)
    values ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '[[0,0],[1,0],[0,1]]')
    on conflict (zona_id) do update set pontos = excluded.pontos;
    falhou := false;
  exception when insufficient_privilege then falhou := true; end;
  assert falhou, 'RLS: escrita em geometria de outra propriedade deveria falhar';
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
begin
  assert (select count(*) from public.argos_localizacoes_recentes) = 0, 'RLS: localizacoes de outra propriedade visiveis';
  assert (select modo from public.argos_referencias_espaciais) = 'planta', 'dono B deve ver a propria referencia';
end $$;

-- anon não lê nada.
reset role;
set local role anon;
do $$
declare
  falhou boolean;
begin
  begin
    perform 1 from public.argos_referencias_espaciais;
    falhou := false;
  exception when insufficient_privilege then falhou := true; end;
  assert falhou, 'anon nao deveria ler referencias';
end $$;

reset role;
select 'referencia_espacial: ok' as resultado;
rollback;
