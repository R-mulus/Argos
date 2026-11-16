-- Remove a carga sintética de supabase/seeds/demonstracao.sql da propriedade de demonstração.
-- Executar manualmente como administrador. Apaga somente registros com a marca da carga:
-- eventos DEMO-ARGOS-20261116:*, animais DEMO-* com a observação da carga, dispositivos DEMO-* simulados
-- e zonas "DEMO · *". Cadastros reais, leituras reais e avisos reais não são tocados.
begin;
do $remover$
declare
  p uuid := '8da8c584-e51b-4b99-808d-8cf55cee7674';
  marca text := 'DEMO-ARGOS-20261116';
begin
  perform pg_advisory_xact_lock(hashtext(marca || p::text));
  delete from public.argos_iot_jobs where propriedade_id = p and evento_id like marca || ':%';
  delete from public.deteccoes where propriedade_id = p and evento_id like marca || ':%';
  delete from public.alertas where propriedade_id = p and origem_evento like marca || ':%';
  delete from public.pesagens where propriedade_id = p and animal_id in (
    select id from public.animais
    where propriedade_id = p and identificacao like 'DEMO-%' and observacoes like '%' || marca || '%');
  delete from public.vinculos where propriedade_id = p and transmissor_id in (
    select id from public.dispositivos
    where propriedade_id = p and codigo like 'DEMO-T%' and versao_firmware = 'simulado');
  delete from public.zonas where propriedade_id = p and nome like 'DEMO · %';
  delete from public.dispositivos where propriedade_id = p and codigo like 'DEMO-%' and versao_firmware = 'simulado';
  delete from public.animais
  where propriedade_id = p and identificacao like 'DEMO-%' and observacoes like '%' || marca || '%';
end;
$remover$;
commit;
