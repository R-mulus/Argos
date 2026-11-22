import { readConfig } from '../src/config.js';
import { SupabaseRepository } from '../src/database.js';
const c = readConfig();
const { client } = new SupabaseRepository(c.supabaseUrl, c.supabaseKey, c.requestTimeout, 0);
for (const [table, columns] of [
  ['dispositivos', 'id,propriedade_id,tipo,status,identificador_hardware'],
  ['deteccoes', 'id,propriedade_id,receptor_id,transmissor_id,evento_id,rssi_dbm,bateria_percentual,detectado_em,recebido_em,recebido_no_gateway_em,vinculo_id,zona_id'],
  ['vinculos', 'id,propriedade_id,transmissor_id,animal_id,inicio_em,fim_em'],
] as const) {
  const { error } = await client.from(table).select(columns).limit(1);
  if (error) throw new Error(`${table}: ${error.code}`);
  console.log(`${table}: colunas acessíveis (somente leitura)`);
}
console.log('Não insere dados nem modifica RLS. O índice único deve ser conferido pelo SQL documentado.');
