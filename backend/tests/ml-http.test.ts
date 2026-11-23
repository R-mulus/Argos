import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import express from 'express';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { mlFilter } from '../src/controllers/ml.controller.js';
import { validateAnalysis } from '../src/services/ml.service.js';
import type { PainelML } from '@argos/shared';

const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fixture=()=>JSON.parse(readFileSync(new URL('../../supabase/testes/exemplo-vazio.json',import.meta.url),'utf8'));
const port=(s:Server)=>{const a=s.address();if(!a||typeof a==='string')throw Error('port');return `http://127.0.0.1:${a.port}`;};
const close=(s:Server)=>new Promise<void>((resolve,reject)=>s.close(e=>e?reject(e):resolve()));

test('filtros e JSON SQL rejeitam datas e contratos incompletos',()=>{
 const filter={animal_id:uid(21),inicio:'2026-11-01T00:00:00Z',fim:'2026-11-02T00:00:00Z'};
 assert.equal(mlFilter(filter).period,'dia');
 for(const change of [{inicio:'2026-11-01'}, {fim:filter.inicio}, {fim:'2027-01-01T00:00:00Z'}, {periodo:'ano'}])assert.throws(()=>mlFilter({...filter,...change}));
 assert.doesNotThrow(()=>validateAnalysis(fixture()));
 const invalid=fixture();invalid.comportamentos.percentuais.comendo=NaN;
 assert.throws(()=>validateAnalysis(invalid));assert.throws(()=>validateAnalysis({resumo:{},movimentacao:{},comportamentos:{}}));
});

test('HTTP ML autentica, consulta SQL, mantém histórico sem workers e controla falhas',async()=>{
 const fake=express();fake.use(express.json());
 let mode='ok';let seenBody:unknown;const queries:URL[]=[];
 fake.get('/auth/v1/user',(req,res)=>{
  if(req.get('authorization')!=='Bearer fixture-token')return res.status(401).json({message:'invalid'});
  res.json({id:uid(1),is_anonymous:false});
 });
 fake.all('/rest/v1/{*path}',(req,res)=>{
  const url=new URL(req.originalUrl,'http://fixture');queries.push(url);
  assert.equal(req.get('authorization'),'Bearer fixture-token');
  if(mode==='offline')return res.status(503).json({code:'OFFLINE'});
  const name=url.pathname.split('/').at(-1);
  if(name==='propriedades')return res.json([{id:uid(11),usuario_id:uid(1)}]);
  if(name==='animais')return res.json(url.searchParams.get('id')==='eq.'+uid(21)?[{id:uid(21)}]:[]);
  if(name==='argos_ml_analise') {
   seenBody=req.body;
   if(mode==='rpc-missing')return res.status(404).json({code:'PGRST202'});
   if(mode==='bad-json')return res.json({resumo:{}});
   const value=fixture();value.qualidade.origens=['experimental'];value.qualidade.referenciais=['demo-v1'];
   return res.json(value);
  }
  assert.equal(url.searchParams.get('propriedade_id'),'eq.'+uid(11));
  if(name==='argos_modelos_ml')return res.json([]);
  const common={id:uid(99),propriedade_id:uid(11),animal_id:uid(21),evento_id:'fixture',observado_em:'2026-11-01T00:00:00Z',origem:'experimental',referencial_versao:'demo-v1'};
  res.set('content-range','0-0/1');
  if(name==='argos_localizacoes')return res.json([{...common,transmissor_id:uid(31),x_m:3,y_m:4,erro_residual_m:1,receptores_utilizados:3}]);
  if(name==='argos_predicoes')return res.json([{...common,previsto_para:'2026-11-01T00:05:00Z',modelo_versao:'demo',atual_x_m:3,atual_y_m:4,proximo_x_m:4,proximo_y_m:5,comportamento:null,confianca:null,probabilidades:null}]);
  return res.status(404).json({code:'unknown'});
 });
 const db=fake.listen(0);await once(db,'listening');
 const api=createApp({port:3333,supabaseUrl:port(db),supabasePublishableKey:'fixture-public',corsOrigins:[]}).listen(0);
 await once(api,'listening');
 const path='/api/iot/analise?'+new URLSearchParams({animal_id:uid(21),inicio:'2026-11-01T00:00:00Z',fim:'2026-11-02T00:00:00Z',periodo:'dia'});
 const headers={Authorization:'Bearer fixture-token'};
 try {
  assert.equal((await fetch(port(api)+path)).status,401);
  assert.equal((await fetch(port(api)+path,{headers:{Authorization:'Bearer bad'}})).status,401);
  let response=await fetch(port(api)+path,{headers});assert.equal(response.status,200);
  const result=(await response.json() as {data:PainelML}).data;
  assert.equal(result.origem,'experimental');assert.equal(result.referencial,'demo-v1');
  assert.equal(result.historico.length,1);assert.equal(result.previsoes[0].comportamento,null);
  assert.equal(result.previsoes[0].proximo_x_m,4);assert.deepEqual(result.modelos,[]);
  assert.equal(result.resumo.distancia_estimada_m,null); // servidor não recalcula da posição
  assert.deepEqual(seenBody,{p_animal_id:uid(21),p_inicio:'2026-11-01T00:00:00.000Z',p_fim:'2026-11-02T00:00:00.000Z',p_periodo:'dia'});
  assert.equal((await fetch(port(api)+path.replace(uid(21),uid(22)),{headers})).status,404);
  for(const [state,code] of [['rpc-missing','ML_SQL_UNAVAILABLE'],['bad-json','ML_SQL_CONTRACT'],['offline','ML_DATABASE_UNAVAILABLE']]) {
   mode=state!;response=await fetch(port(api)+path,{headers});assert.equal(response.status,503);
   assert.equal((await response.json() as {error:{code:string}}).error.code,code);
  }
  mode='ok';response=await fetch(port(api)+'/api/iot/predicoes?animal_id='+uid(21)+'&inicio=2026-11-01T00:00:00Z',{headers});
  assert.equal(response.status,200);
  assert.ok(queries.some(u=>u.searchParams.get('observado_em')?.startsWith('gte.')));
 } finally {await close(api);await close(db);}
});
