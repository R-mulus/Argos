begin;
create table public.argos_modelos_ml (
 propriedade_id uuid not null references public.propriedades(id),
 task text not null check(task in ('position','behavior')),
 model_version text not null,
 approval_status text not null check(approval_status in ('demo_approved','production_approved')),
 approved boolean not null,
 origem text not null check(origem in ('experimental','real')),
 referencial_versao text not null, calibracao_sha256 text not null,
 training_samples integer not null, model_parameters integer,
 tensorflow_version text, prediction_horizon_minutes double precision,
 inference_time_ms double precision, evaluation jsonb,
 atualizado_em timestamptz not null default now(),
 primary key(propriedade_id,task,model_version),
 check ((approval_status='demo_approved' and not approved and origem='experimental')
     or (approval_status='production_approved' and approved and origem='real'))
);
alter table public.argos_modelos_ml enable row level security;
revoke all on public.argos_modelos_ml from public,anon,authenticated;
grant select on public.argos_modelos_ml to authenticated;
grant all on public.argos_modelos_ml to service_role;
create policy argos_modelos_proprietario on public.argos_modelos_ml for select to authenticated
 using(exists(select 1 from public.propriedades p where p.id=propriedade_id and p.usuario_id=(select auth.uid())));
commit;
