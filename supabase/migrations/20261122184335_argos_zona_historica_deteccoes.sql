-- Aplicada ao Supabase hospedado em 22/11/2026 (versão 20261122184335).
--
-- Problema: o worker de ingestão `worker/` (branch backend-iot) grava todas as detecções com
-- zona_id nulo, porque `zonas` guarda só a associação atual. O resumo_monitoramento conta animais
-- por d.zona_id; com zona nula o animal aparece em "recentes_sem_zona" e nenhuma zona é contada.
--
-- Regra: a zona do receptor só é atribuída quando a associação é comprovadamente a mesma do
-- instante observado: zona ativa do receptor (zonas.receptor_id é único) e não alterada depois da
-- detecção (zonas.updated_at <= detectado_em; o trigger zonas_atualizar_updated_at registra toda
-- alteração). Sem horário de captura não há zona. Zona já informada pelo worker é preservada.
-- Vale para qualquer processo de ingestão, sem alterar o código dos workers.
create or replace function public.argos_atribuir_zona_historica()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.zona_id is null and new.detectado_em is not null then
    select z.id into new.zona_id
      from public.zonas z
     where z.propriedade_id = new.propriedade_id
       and z.receptor_id = new.receptor_id
       and z.ativa
       and z.updated_at <= new.detectado_em;
  end if;
  return new;
end;
$$;
revoke all on function public.argos_atribuir_zona_historica() from public, anon, authenticated;

create trigger deteccoes_atribuir_zona_historica
before insert on public.deteccoes
for each row execute function public.argos_atribuir_zona_historica();

comment on function public.argos_atribuir_zona_historica() is
  'Atribui a zona do receptor quando ela está ativa e não foi alterada depois de detectado_em.';
