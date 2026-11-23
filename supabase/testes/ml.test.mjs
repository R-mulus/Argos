import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// PostgreSQL WASM descartável: sem URL, credenciais, MQTT ou Python.
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const start='2026-11-01T00:00:00Z', end='2026-11-01T00:10:00Z';
async function database() {
 const db = new PGlite({ extensions: { btree_gist } });
 await db.exec(await readFile(new URL('bootstrap.sql',import.meta.url),'utf8'));
 for (const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
   // pg_cron (20261118113726) não existe no PGlite; cron.schedule é simulado no bootstrap.
   const sql=(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'))
     .replace(/^create extension if not exists pg_cron;$/m,'-- pg_cron simulado no teste isolado');
   try { await db.exec(sql); }
   catch(e) { throw new Error(`Migration ${name}: ${e.message}`, {cause:e}); }
 }
 await db.query('insert into auth.users values ($1),($2)',[uid(1),uid(2)]);
 for (let i=1;i<=2;i++) {
  await db.query('insert into propriedades(id,usuario_id,nome) values($1,$2,$3)',[uid(i+10),uid(i),'Teste '+i]);
  await db.query('insert into animais(id,propriedade_id,identificacao) values($1,$2,$3)',[uid(i+20),uid(i+10),'A'+i]);
  await db.query("insert into dispositivos(id,propriedade_id,codigo,tipo) values($1,$2,$3,'transmissor')",[uid(i+30),uid(i+10),'TX'+i]);
  await db.query("insert into vinculos(propriedade_id,animal_id,transmissor_id,inicio_em) values($1,$2,$3,'2026-10-01Z')",[uid(i+10),uid(i+20),uid(i+30)]);
 }
 return db;
}
async function asUser(db,n=1) {
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);
}
async function rpc(db,animal=uid(21),a=start,b=end,period='dia') {
 const v=(await db.query('select public.argos_ml_analise($1,$2,$3,$4) as data',[animal,a,b,period])).rows[0].data;
 for(const [key,value] of Object.entries(v.resumo)) assert.ok(value===null||Number.isFinite(value),key);
 assert.equal(v.movimentacao.origem,'derivado_rssi');assert.equal(v.movimentacao.periodo,period);
 assert.equal(v.comportamentos.origem,'observado_validado');assert.equal(typeof v.comportamentos.disponivel,'boolean');
 for(const c of ['parado','comendo','em_movimento','outro']) {
  const n=v.comportamentos.percentuais[c];assert.ok(n===null||(Number.isFinite(n)&&n>=0&&n<=100));
 }
 for(const p of v.movimentacao.pontos) {
  assert.ok(Date.parse(p.inicio)<Date.parse(p.fim));
  for(const k of ['distancia_estimada_m','velocidade_media_estimada_m_s','cobertura_percentual','segundos_observados','segundos_repouso_aparente','segundos_movimento_aparente','segundos_indeterminados'])
   assert.ok(p[k]===null||Number.isFinite(p[k]),k);
  assert.ok(p.cobertura_percentual>=0 && p.cobertura_percentual<=100);
 }
 return v;
}
async function position(db,n,seconds,x=0,overrides={}) {
 const data={id:uid(100+n),propriedade_id:uid(11),animal_id:uid(21),transmissor_id:uid(31),evento_id:'e'+n,
  observado_em:new Date(Date.parse(start)+seconds*1000).toISOString(),calculado_em:start,x_m:x,y_m:0,
  erro_residual_m:1,receptores_utilizados:3,referencial_versao:'fixture-v1',calibracao_sha256:'a'.repeat(64),origem:'experimental',...overrides};
 await db.query(`insert into argos_localizacoes(${Object.keys(data).join(',')}) values(${Object.keys(data).map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(data));
}

test('migration, vazio, contrato, permissões e dois usuários',async()=>{
 const db=await database();
 try {
  await asUser(db);
  const v=await rpc(db);
  assert.deepEqual(v,JSON.parse(await readFile(new URL('exemplo-vazio.json',import.meta.url),'utf8')));
  assert.equal(v.resumo.localizacoes,0); assert.equal(v.resumo.distancia_estimada_m,null);
  assert.equal(v.resumo.cobertura_percentual,0); assert.equal(v.resumo.segundos_repouso_aparente,null);
  assert.equal(v.movimentacao.pontos[0].segundos_observados,0);
  assert.equal(v.comportamentos.disponivel,false); assert.equal(v.comportamentos.percentuais.comendo,null);
  assert.equal(v.previsoes.quantidade,0);
  assert.deepEqual(Object.keys(v.resumo).sort(),['distancia_estimada_m','velocidade_media_estimada_m_s','segundos_repouso_aparente','segundos_movimento_aparente','cobertura_percentual','localizacoes','rms_medio_m'].sort());
  for(const [a,b,p] of [[end,start,'dia'],[start,end,'ano'],[null,end,'dia'],[start,'2027-01-01Z','dia']])
   await assert.rejects(rpc(db,uid(21),a,b,p),e=>e.code==='22023');
  await assert.rejects(rpc(db,uid(22)),e=>e.code==='42501');
  await asUser(db,2); assert.equal((await rpc(db,uid(22))).resumo.localizacoes,0);
  await assert.rejects(rpc(db,uid(21)),e=>e.code==='42501');
  await db.exec('reset role; set role anon');
  await assert.rejects(rpc(db),e=>e.code==='42501');
 } finally {await db.close();}
});

test('posições fora de ordem, distância, lacuna e corte de buckets',async()=>{
 const db=await database();
 try {
  await position(db,1,0); await asUser(db);
  assert.equal((await rpc(db)).resumo.distancia_estimada_m,null);
  await db.exec('reset role');
  await position(db,3,120,120); await position(db,2,60,60); await position(db,4,400,150);
  await asUser(db); const v=await rpc(db);
  assert.equal(v.resumo.distancia_estimada_m,120);
  assert.equal(v.resumo.velocidade_media_estimada_m_s,1);
  assert.equal(v.resumo.cobertura_percentual,20);
  assert.equal(v.resumo.segundos_movimento_aparente,120);
  assert.equal(v.qualidade.segundos_sem_cobertura,480);
  assert.deepEqual(v.qualidade.origens,['experimental']);
  const split=await rpc(db,uid(21),'2026-10-31T23:59:30Z','2026-11-01T00:01:30Z');
  assert.equal(split.movimentacao.pontos.length,2);
  assert.equal(split.resumo.distancia_estimada_m,90);
 } finally {await db.close();}
});

test('não atravessa troca de referencial, proveniência ausente ou vínculo inválido',async()=>{
 const db=await database();
 try {
  await position(db,1,0); await position(db,2,60,10,{referencial_versao:'different'});
  await position(db,3,120,20,{referencial_versao:null});
  await position(db,4,180,30,{transmissor_id:uid(32)});
  await asUser(db); const v=await rpc(db);
  assert.equal(v.resumo.distancia_estimada_m,null);
  assert.equal(v.resumo.cobertura_percentual,0);
  assert.equal(v.qualidade.localizacoes_excluidas,2);
 } finally {await db.close();}
});

test('observações revisadas calculam percentuais, previsões não viram rótulos',async()=>{
 const db=await database();
 try {
  const classes=['parado','comendo','em_movimento','outro'];
  for(let c=0;c<4;c++) for(let j=0;j<2;j++) {
   await db.query(`insert into argos_observacoes_visao(id,propriedade_id,animal_id,observado_em,comportamento,confianca,camera_id,revisado_em,revisado_por)
    values($1,$2,$3,$4,$5,1,'fixture-camera',$6,'fixture-reviewer')`,
    [uid(300+c*2+j),uid(11),uid(21),new Date(Date.parse(start)+(c*120+j*60)*1000).toISOString(),classes[c],start]);
  }
  await db.query(`insert into argos_predicoes(id,propriedade_id,animal_id,modelo_versao,criado_em,evento_id,observado_em,previsto_para,proximo_x_m,proximo_y_m)
   values($1,$2,$3,'fixture-model',$4,'fixture',$4,$5,5,6)`,[uid(500),uid(11),uid(21),start,end]);
  await asUser(db); const v=await rpc(db);
  assert.deepEqual(v.comportamentos.percentuais,{parado:25,comendo:25,em_movimento:25,outro:25});
  assert.equal(v.comportamentos.cobertura_percentual,40);
  assert.equal(v.qualidade.observacoes_confiaveis,8);
  assert.equal(v.previsoes.quantidade,1); assert.equal(v.previsoes.horizonte_segundos,600);
  assert.equal(v.previsoes.desempenho_validado,null);
  assert.equal((await db.query('select comportamento,confianca,probabilidades from argos_predicoes')).rows[0].comportamento,null);
  await asUser(db,2); assert.equal((await db.query('select * from argos_observacoes_visao')).rows.length,0);
  assert.equal((await db.query('select * from argos_predicoes')).rows.length,0);
  await db.exec('reset role; update argos_observacoes_visao set revisado_em=null');
  await asUser(db); assert.equal((await rpc(db)).comportamentos.disponivel,false);
 } finally {await db.close();}
});

test('qualidade inválida não cria ponte nem repouso; RPC é invoker',async()=>{
 const db=await database();
 try {
  await position(db,1,0);await position(db,2,60,0,{erro_residual_m:99});await position(db,3,120,0);
  const f=(await db.query("select prosecdef,proconfig from pg_proc where proname='argos_ml_analise'")).rows[0];
  assert.equal(f.prosecdef,false);assert.ok(f.proconfig.some(x=>x.startsWith('search_path=')));
  await asUser(db);const v=await rpc(db);
  assert.equal(v.resumo.distancia_estimada_m,null);assert.equal(v.resumo.segundos_repouso_aparente,null);
  await assert.rejects(db.exec('update argos_observacoes_visao set revisado_em=now()'),e=>e.code==='42501');
  await db.exec('set timezone=\'America/Sao_Paulo\'');
  assert.deepEqual(await rpc(db),v);
 } finally {await db.close();}
});

test('não cruza interrupção do vínculo histórico nem relógios duplicados',async()=>{
 const db=await database();
 try {
  await db.exec("update vinculos set fim_em='2026-11-01T00:00:30Z' where animal_id='"+uid(21)+"'");
  await db.query("insert into vinculos(propriedade_id,animal_id,transmissor_id,inicio_em) values($1,$2,$3,'2026-11-01T00:00:45Z')",[uid(11),uid(21),uid(31)]);
  await position(db,1,0);await position(db,2,60,60);
  await asUser(db);assert.equal((await rpc(db)).resumo.distancia_estimada_m,null);
  await db.exec('reset role');await position(db,3,60,61);await position(db,4,120,70);
  await asUser(db);assert.equal((await rpc(db)).resumo.cobertura_percentual,0);
 } finally {await db.close();}
});

test('câmeras conflitantes não fabricam comportamento observado',async()=>{
 const db=await database();
 try {
  for(const [i,s,camera,behavior] of [[0,0,'a','comendo'],[1,60,'a','comendo'],[2,30,'b','parado']]) {
   await db.query(`insert into argos_observacoes_visao(id,propriedade_id,animal_id,observado_em,comportamento,confianca,camera_id,revisado_em,revisado_por)
    values($1,$2,$3,$4,$5,1,$6,$7,'fixture')`,[uid(600+i),uid(11),uid(21),new Date(Date.parse(start)+s*1000).toISOString(),behavior,camera,start]);
  }
  await asUser(db);assert.equal((await rpc(db)).comportamentos.disponivel,false);
 } finally {await db.close();}
});

test('RSSI → localização Python → persistência SQL → consulta sem ML/IoT',
 {skip:!process.env.ARGOS_TEST_PYTHON},async()=>{
 const output=execFileSync(process.env.ARGOS_TEST_PYTHON,[fileURLToPath(new URL('localize_fixture.py',import.meta.url))],{
  cwd:fileURLToPath(new URL('../../ml/',import.meta.url)),encoding:'utf8',
  env:{...process.env,PYTHONPATH:fileURLToPath(new URL('../../ml/',import.meta.url))},timeout:30000,
 });
 // O processo Python já terminou; agora só consultamos dados persistidos.
 const db=await database();
 try {
  for(const row of JSON.parse(output)) await db.query(`insert into argos_localizacoes(${Object.keys(row).join(',')}) values(${Object.keys(row).map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
  await asUser(db);const v=await rpc(db);
  assert.equal(v.resumo.localizacoes,3);
  assert.ok(Math.abs(v.resumo.distancia_estimada_m-2)<1e-6);
  assert.equal(v.resumo.cobertura_percentual,20);
  assert.deepEqual(v.qualidade.origens,['synthetic']);
 } finally {await db.close();}
});
