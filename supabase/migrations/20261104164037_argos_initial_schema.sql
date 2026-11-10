
-- Argos: esquema inicial, 2026-11-04.
-- Supabase Auth em auth.users; tabelas de dominio em public.
-- Os eventos MQTT sao inseridos exclusivamente por cliente de servidor (service_role).

create extension if not exists btree_gist with schema extensions;

create table public.propriedades (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null unique references auth.users(id) on delete cascade,
    nome text not null check (char_length(btrim(nome)) between 1 and 160),
    municipio text,
    uf char(2) check (uf is null or uf ~ '^[A-Z]{2}$'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.animais (
    id uuid primary key default gen_random_uuid(),
    propriedade_id uuid not null references public.propriedades(id) on delete cascade,
    identificacao text not null check (char_length(btrim(identificacao)) between 1 and 80),
    sexo text check (sexo in ('macho', 'femea')),
    categoria text,
    raca text,
    data_nascimento date,
    origem text,
    lote text,
    observacoes text,
    status text not null default 'ativo' check (status in ('ativo', 'inativo')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint animais_identificacao_por_propriedade_uk unique (propriedade_id, identificacao),
    constraint animais_id_propriedade_uk unique (id, propriedade_id)
);

create table public.dispositivos (
    id uuid primary key default gen_random_uuid(),
    propriedade_id uuid not null references public.propriedades(id) on delete cascade,
    codigo text not null check (char_length(btrim(codigo)) between 1 and 80),
    identificador_hardware text unique
        check (identificador_hardware is null or char_length(btrim(identificador_hardware)) between 1 and 160),
    nome text,
    tipo text not null check (tipo in ('transmissor', 'receptor')),
    status text not null default 'ativo' check (status in ('ativo', 'inativo')),
    versao_firmware text,
    ultima_comunicacao_em timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint dispositivos_codigo_por_tipo_uk unique (propriedade_id, tipo, codigo),
    constraint dispositivos_id_propriedade_uk unique (id, propriedade_id)
);

create table public.zonas (
    id uuid primary key default gen_random_uuid(),
    propriedade_id uuid not null references public.propriedades(id) on delete cascade,
    receptor_id uuid unique,
    nome text not null check (char_length(btrim(nome)) between 1 and 120),
    descricao text,
    ativa boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint zonas_ativa_exige_receptor_chk check (not ativa or receptor_id is not null),
    constraint zonas_nome_por_propriedade_uk unique (propriedade_id, nome),
    constraint zonas_id_propriedade_uk unique (id, propriedade_id),
    constraint zonas_receptor_mesma_propriedade_fk foreign key (receptor_id, propriedade_id)
        references public.dispositivos(id, propriedade_id)
);

create table public.vinculos (
    id uuid primary key default gen_random_uuid(),
    propriedade_id uuid not null references public.propriedades(id) on delete cascade,
    animal_id uuid not null,
    transmissor_id uuid not null,
    inicio_em timestamptz not null default now(),
    fim_em timestamptz,
    created_at timestamptz not null default now(),
    constraint vinculos_periodo_valido_chk check (fim_em is null or fim_em > inicio_em),
    constraint vinculos_animal_propriedade_fk foreign key (animal_id, propriedade_id)
        references public.animais(id, propriedade_id),
    constraint vinculos_transmissor_propriedade_fk foreign key (transmissor_id, propriedade_id)
        references public.dispositivos(id, propriedade_id),
    constraint vinculos_id_propriedade_transmissor_uk unique (id, propriedade_id, transmissor_id),
    constraint vinculos_animal_sem_sobreposicao_excl exclude using gist (
        animal_id with =,
        tstzrange(inicio_em, fim_em, '[)') with &&
    ),
    constraint vinculos_transmissor_sem_sobreposicao_excl exclude using gist (
        transmissor_id with =,
        tstzrange(inicio_em, fim_em, '[)') with &&
    )
);

create table public.deteccoes (
    id uuid primary key default gen_random_uuid(),
    propriedade_id uuid not null references public.propriedades(id) on delete cascade,
    transmissor_id uuid not null,
    receptor_id uuid not null,
    zona_id uuid,
    vinculo_id uuid,
    evento_id text not null check (char_length(btrim(evento_id)) between 1 and 160),
    rssi_dbm smallint not null check (rssi_dbm between -127 and 0),
    bateria_percentual smallint check (bateria_percentual between 0 and 100),
    detectado_em timestamptz,
    recebido_em timestamptz not null default now(),
    constraint deteccoes_evento_por_receptor_uk unique (receptor_id, evento_id),
    constraint deteccoes_transmissor_propriedade_fk foreign key (transmissor_id, propriedade_id)
        references public.dispositivos(id, propriedade_id),
    constraint deteccoes_receptor_propriedade_fk foreign key (receptor_id, propriedade_id)
        references public.dispositivos(id, propriedade_id),
    constraint deteccoes_zona_propriedade_fk foreign key (zona_id, propriedade_id)
        references public.zonas(id, propriedade_id),
    constraint deteccoes_vinculo_propriedade_transmissor_fk
        foreign key (vinculo_id, propriedade_id, transmissor_id)
        references public.vinculos(id, propriedade_id, transmissor_id)
);

create table public.alertas (
    id uuid primary key default gen_random_uuid(),
    propriedade_id uuid not null references public.propriedades(id) on delete cascade,
    animal_id uuid,
    dispositivo_id uuid,
    tipo text not null check (char_length(btrim(tipo)) between 1 and 80),
    titulo text not null check (char_length(btrim(titulo)) between 1 and 160),
    descricao text,
    prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'critica')),
    estado text not null default 'novo' check (estado in ('novo', 'lido', 'resolvido')),
    criado_em timestamptz not null default now(),
    lido_em timestamptz,
    resolvido_em timestamptz,
    constraint alertas_animal_propriedade_fk foreign key (animal_id, propriedade_id)
        references public.animais(id, propriedade_id),
    constraint alertas_dispositivo_propriedade_fk foreign key (dispositivo_id, propriedade_id)
        references public.dispositivos(id, propriedade_id)
);

-- Indices para historico, dashboard e manutencao das FKs.
create index animais_propriedade_status_idx on public.animais (propriedade_id, status);
create index dispositivos_propriedade_tipo_idx on public.dispositivos (propriedade_id, tipo);
create index zonas_propriedade_ativa_idx on public.zonas (propriedade_id, ativa);
create index vinculos_animal_inicio_idx on public.vinculos (animal_id, inicio_em desc);
create index vinculos_transmissor_inicio_idx on public.vinculos (transmissor_id, inicio_em desc);
create index deteccoes_propriedade_tempo_idx on public.deteccoes
    (propriedade_id, detectado_em desc nulls last, recebido_em desc);
create index deteccoes_transmissor_tempo_idx on public.deteccoes
    (transmissor_id, detectado_em desc nulls last, recebido_em desc);
create index deteccoes_receptor_tempo_idx on public.deteccoes
    (receptor_id, recebido_em desc);
create index deteccoes_zona_tempo_idx on public.deteccoes
    (zona_id, recebido_em desc) where zona_id is not null;
create index alertas_propriedade_estado_tempo_idx on public.alertas
    (propriedade_id, estado, criado_em desc);
create index alertas_animal_idx on public.alertas (animal_id) where animal_id is not null;
create index alertas_dispositivo_idx on public.alertas (dispositivo_id) where dispositivo_id is not null;

-- Atualizacao automatica de updated_at.
create function public.argos_atualizar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;
create trigger propriedades_atualizar_updated_at
before update on public.propriedades for each row
execute function public.argos_atualizar_updated_at();
create trigger animais_atualizar_updated_at
before update on public.animais for each row
execute function public.argos_atualizar_updated_at();
create trigger dispositivos_atualizar_updated_at
before update on public.dispositivos for each row
execute function public.argos_atualizar_updated_at();
create trigger zonas_atualizar_updated_at
before update on public.zonas for each row
execute function public.argos_atualizar_updated_at();

-- O tipo do ESP32 nao pode ser alterado apos seu cadastro.
create function public.argos_bloquear_mudanca_tipo_dispositivo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.tipo is distinct from old.tipo then
        raise exception 'Tipo de dispositivo nao pode ser alterado; cadastre outro dispositivo.'
            using errcode = '23514';
    end if;
    return new;
end;
$$;
create trigger dispositivos_tipo_imutavel
before update on public.dispositivos for each row
execute function public.argos_bloquear_mudanca_tipo_dispositivo();

-- Uma zona usa receptor; um vinculo usa transmissor; deteccao usa os dois tipos.
-- A propriedade ja e protegida pelas FKs compostas.
create function public.argos_validar_papeis_dispositivos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_table_name = 'zonas' then
        if new.receptor_id is not null and not exists (
            select 1 from public.dispositivos d
             where d.id = new.receptor_id and d.propriedade_id = new.propriedade_id and d.tipo = 'receptor'
        ) then
            raise exception 'Zona requer dispositivo do tipo receptor pertencente a propriedade.'
                using errcode = '23514';
        end if;
    elsif tg_table_name = 'vinculos' then
        if not exists (
            select 1 from public.dispositivos d
             where d.id = new.transmissor_id and d.propriedade_id = new.propriedade_id and d.tipo = 'transmissor'
        ) then
            raise exception 'Vinculo requer dispositivo do tipo transmissor pertencente a propriedade.'
                using errcode = '23514';
        end if;
    elsif tg_table_name = 'deteccoes' then
        if not exists (
            select 1 from public.dispositivos d
             where d.id = new.transmissor_id and d.propriedade_id = new.propriedade_id and d.tipo = 'transmissor'
        ) or not exists (
            select 1 from public.dispositivos d
             where d.id = new.receptor_id and d.propriedade_id = new.propriedade_id and d.tipo = 'receptor'
        ) then
            raise exception 'Deteccao requer transmissor e receptor da mesma propriedade.'
                using errcode = '23514';
        end if;
    end if;
    return new;
end;
$$;
create trigger zonas_validar_receptor
before insert or update of receptor_id, propriedade_id on public.zonas
for each row execute function public.argos_validar_papeis_dispositivos();
create trigger vinculos_validar_transmissor
before insert or update of transmissor_id, propriedade_id on public.vinculos
for each row execute function public.argos_validar_papeis_dispositivos();
create trigger deteccoes_validar_dispositivos
before insert or update of transmissor_id, receptor_id, propriedade_id on public.deteccoes
for each row execute function public.argos_validar_papeis_dispositivos();

-- Vínculos históricos: identidade e inicio imutaveis, encerramento definitivo.
create function public.argos_proteger_historico_vinculo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.id is distinct from old.id
       or new.propriedade_id is distinct from old.propriedade_id
       or new.animal_id is distinct from old.animal_id
       or new.transmissor_id is distinct from old.transmissor_id
       or new.inicio_em is distinct from old.inicio_em
       or new.created_at is distinct from old.created_at then
        raise exception 'Identidade e inicio de vinculo historico sao imutaveis.'
            using errcode = '23514';
    end if;
    if old.fim_em is not null and new.fim_em is distinct from old.fim_em then
        raise exception 'Vinculo encerrado nao pode ser reaberto ou alterado.'
            using errcode = '23514';
    end if;
    return new;
end;
$$;
create trigger vinculos_historico_protegido
before update on public.vinculos for each row
execute function public.argos_proteger_historico_vinculo();

-- RLS: uma conta = uma propriedade. IoT nao recebe privilegio de anon/authenticated.
alter table public.propriedades enable row level security;
alter table public.animais enable row level security;
alter table public.dispositivos enable row level security;
alter table public.zonas enable row level security;
alter table public.vinculos enable row level security;
alter table public.deteccoes enable row level security;
alter table public.alertas enable row level security;

-- Revogacao explicita antes de conceder privilegios minimos.
revoke all on table public.propriedades, public.animais, public.dispositivos,
    public.zonas, public.vinculos, public.deteccoes, public.alertas
    from anon, authenticated;

grant select, insert, update on public.propriedades to authenticated;
grant select, insert, update on public.animais to authenticated;
grant select, insert, update on public.dispositivos to authenticated;
grant select, insert, update on public.zonas to authenticated;
grant select, insert on public.vinculos to authenticated;
grant update (fim_em) on public.vinculos to authenticated;
grant select on public.deteccoes to authenticated;
grant select on public.alertas to authenticated;
grant update (estado, lido_em, resolvido_em) on public.alertas to authenticated;

grant all on table public.propriedades, public.animais, public.dispositivos,
    public.zonas, public.vinculos, public.deteccoes, public.alertas to service_role;

create policy propriedades_select_propria
on public.propriedades for select to authenticated
using (usuario_id = (select auth.uid()));

create policy propriedades_insert_propria
on public.propriedades for insert to authenticated
with check (usuario_id = (select auth.uid()));

create policy propriedades_update_propria
on public.propriedades for update to authenticated
using (usuario_id = (select auth.uid()))
with check (usuario_id = (select auth.uid()));

-- Politicas com EXISTS dependem da propriedade efetivamente vinculada a auth.uid().
create policy animais_select_proprios
on public.animais for select to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));
create policy animais_insert_proprios
on public.animais for insert to authenticated
with check (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));
create policy animais_update_proprios
on public.animais for update to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
))
with check (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));

create policy dispositivos_select_proprios
on public.dispositivos for select to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));
create policy dispositivos_insert_proprios
on public.dispositivos for insert to authenticated
with check (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));
create policy dispositivos_update_proprios
on public.dispositivos for update to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
))
with check (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));

create policy zonas_select_proprias
on public.zonas for select to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));
create policy zonas_insert_proprias
on public.zonas for insert to authenticated
with check (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));
create policy zonas_update_proprias
on public.zonas for update to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
))
with check (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));

create policy vinculos_select_proprios
on public.vinculos for select to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));
create policy vinculos_insert_proprios
on public.vinculos for insert to authenticated
with check (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));
create policy vinculos_update_proprios
on public.vinculos for update to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
))
with check (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));

create policy deteccoes_select_proprias
on public.deteccoes for select to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));

create policy alertas_select_proprios
on public.alertas for select to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));
create policy alertas_update_proprios
on public.alertas for update to authenticated
using (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
))
with check (exists (
    select 1 from public.propriedades p
    where p.id = propriedade_id and p.usuario_id = (select auth.uid())
));

comment on table public.deteccoes is
'Leituras MQTT brutas; evento_id e unico por receptor. detectado_em e nulo quando ESP32 nao tem relogio confiavel; recebido_em e sempre gravado pelo servidor.';
comment on table public.vinculos is
'Relacionamentos historicos animal-transmissor; intervalos [inicio_em, fim_em) sem sobreposicoes.';
comment on column public.dispositivos.identificador_hardware is
'Identificador fisico do ESP32, opcional ate seu provisionamento; globalmente unico quando preenchido.';
comment on column public.zonas.ativa is
'Zona pode ser cadastrada sem receptor, mas somente ativada com receptor atribuido.';
