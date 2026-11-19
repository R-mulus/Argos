import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { errorHandler } from '../src/lib/http.js';

test('tabela ausente retorna 503 sem revelar detalhes do banco', async () => {
  const app = express();
  app.get('/', () => { throw { code: 'PGRST205', message: 'detalhe interno' }; });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}`);
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.match(JSON.stringify(result), /"code":"SERVICE_UNAVAILABLE"/);
    assert.ok(!JSON.stringify(result).includes('detalhe interno'));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
