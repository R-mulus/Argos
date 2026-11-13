import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

test('rotas IoT exigem token Bearer e health check continua público', async () => {
  const app = createApp({
    port: 3333,
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'sb_publishable_test',
    corsOrigins: ['http://localhost:5173'],
  });
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Porta HTTP indisponível.');
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal((await fetch(base + '/api/deteccoes/retencao?dias=90')).status, 401);

    assert.equal((await fetch(base + '/api/alertas')).status, 401);
    assert.equal((await fetch(base + '/api/alertas/5a61dabf-08c8-4ee1-9de7-1a134751f6bb', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'lido' }),
    })).status, 401);

    for (const path of ['/api/dispositivos', '/api/zonas', '/api/vinculos', '/api/deteccoes', '/api/monitoramento/resumo', '/api/monitoramento/receptores']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 401, path);
      assert.match(JSON.stringify(await response.json()), /\"code\":\"UNAUTHORIZED\"/);
    }

    const body = await fetch(`${base}/api/dispositivos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid JSON',
    });
    assert.equal(body.status, 400);
    assert.match(JSON.stringify(await body.json()), /\"code\":\"INVALID_JSON\"/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
