import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurableQueue } from '../src/queue.js';
import { Processor } from '../src/processor.js';
import { event } from './helpers.js';

test('avisos sobrevivem reinício e confirmação perdida sem duplicar detecções', async () => {
 const dir=mkdtempSync(join(tmpdir(),'argos-notices-'));
 let q=new DurableQueue(join(dir,'queue.sqlite'));
 try {
  q.enqueue(event(1));q.enqueue(event(2));
  const items=q.ready(10);
  for(const item of items) q.retry(item.key,'offline',0);
  q.complete([items[0]!.key]); assert.equal(q.notices().length,0);
  q.close();q=new DurableQueue(join(dir,'queue.sqlite'));
  q.reject(items[1]!.key,'dispositivo_inativo');
  assert.equal(q.notices().length,2);
  const sync=q.notices().find(n=>n.value.tipo==='sincronizacao_concluida')!;
  assert.match(sync.value.descricao,/1 detecções confirmadas e 1 rejeitadas/);
  const delivered=new Set<string>(); let offline=true;
  const processor=new Processor(q,{prepare:async()=>{throw new Error('unexpected');},insert:async()=>{},
    notify:async n=>{delivered.add(n.origem_evento);if(offline)throw new Error('ack lost');}},()=>{});
  await processor.tick();assert.equal(q.notices().length,2);
  offline=false;await processor.tick();
  assert.equal(q.notices().length,0);assert.equal(delivered.size,2);
  assert.equal(q.count('dead'),1);
 } finally {q.close();rmSync(dir,{recursive:true,force:true});}
});

test('sincronização separa propriedades e espera todos os lotes',()=>{
 const q=new DurableQueue(':memory:');
 try {
  q.enqueue(event(1));q.enqueue(event(2));
  q.enqueue({...event(3),propertyId:'another-property'});
  const items=q.ready(10);for(const item of items)q.retry(item.key,'offline',0);
  q.complete([items[0]!.key]);assert.equal(q.notices().length,0);
  q.complete([items[2]!.key]);assert.equal(q.notices().length,1);
  q.complete([items[1]!.key]);assert.equal(q.notices().length,2);
  assert.equal(new Set(q.notices().map(n=>n.value.propriedade_id)).size,2);
 } finally {q.close();}
});
