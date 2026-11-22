-- OPCIONAL, executar só com autorização e depois da migração 20261122184335.
-- Aplica às detecções já gravadas a mesma regra do trigger argos_atribuir_zona_historica:
-- zona ativa do receptor, não alterada depois da captura. Não altera horários, vínculos nem RSSI.
-- Conferência antes:   select count(*) ... (mesmo where, trocando update por select)
update public.deteccoes d
   set zona_id = z.id
  from public.zonas z
 where d.zona_id is null
   and d.detectado_em is not null
   and z.propriedade_id = d.propriedade_id
   and z.receptor_id = d.receptor_id
   and z.ativa
   and z.updated_at <= d.detectado_em;
