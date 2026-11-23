import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { parseGeometriaZona, parseReferenciaEspacial } from '../src/models/espacial.model.js';

test('referência geográfica exige origem medida e recusa campos de planta', () => {
  assert.deepEqual(parseReferenciaEspacial({ modo: 'geografico', origem_latitude: -18.58, origem_longitude: -46.51, azimute_eixo_y_graus: 15 }), {
    modo: 'geografico', origem_latitude: -18.58, origem_longitude: -46.51, azimute_eixo_y_graus: 15,
    planta_url: null, planta_x_min_m: null, planta_y_min_m: null, planta_x_max_m: null, planta_y_max_m: null,
  });
  assert.equal(parseReferenciaEspacial({ modo: 'geografico', origem_latitude: 0, origem_longitude: 0 }).azimute_eixo_y_graus, 0);
  assert.throws(() => parseReferenciaEspacial({ modo: 'geografico', origem_latitude: 91, origem_longitude: 0 }), /origem_latitude/);
  assert.throws(() => parseReferenciaEspacial({ modo: 'geografico', origem_longitude: 0 }), /origem_latitude/);
  assert.throws(() => parseReferenciaEspacial({ modo: 'geografico', origem_latitude: 0, origem_longitude: 0, azimute_eixo_y_graus: 360 }), /azimute/);
  assert.throws(() => parseReferenciaEspacial({ modo: 'geografico', origem_latitude: 0, origem_longitude: 0, planta_url: 'https://x.y/p.png' }), /planta/);
  assert.throws(() => parseReferenciaEspacial({ modo: 'gps' }), /modo/);
  assert.throws(() => parseReferenciaEspacial({ modo: 'geografico', origem_latitude: 0, origem_longitude: 0, propriedade_id: 'x' }), /não permitidos/);
  assert.throws(() => parseReferenciaEspacial({ modo: 'geografico', origem_latitude: '0', origem_longitude: 0 }), /origem_latitude/);
});

test('referência de planta usa só metros e URL https', () => {
  const planta = { modo: 'planta', planta_url: 'https://exemplo.com/planta.png', planta_x_min_m: -10, planta_y_min_m: 0, planta_x_max_m: 200, planta_y_max_m: 150 };
  assert.equal(parseReferenciaEspacial(planta).planta_x_max_m, 200);
  assert.throws(() => parseReferenciaEspacial({ ...planta, planta_url: 'http://exemplo.com/p.png' }), /https/);
  assert.throws(() => parseReferenciaEspacial({ ...planta, planta_url: 'javascript:alert(1)' }), /https/);
  assert.throws(() => parseReferenciaEspacial({ ...planta, planta_x_max_m: -10 }), /máximo maior/);
  assert.throws(() => parseReferenciaEspacial({ ...planta, origem_latitude: -18 }), /latitude/);
  assert.throws(() => parseReferenciaEspacial({ ...planta, planta_y_max_m: Number.NaN }), /planta_y_max_m/);
});

test('geometria da zona valida vértices, repetições e área', () => {
  assert.deepEqual(parseGeometriaZona({ pontos: [[0, 0], [10, 0], [10, 5]] }), { pontos: [[0, 0], [10, 0], [10, 5]] });
  assert.throws(() => parseGeometriaZona({ pontos: [[0, 0], [1, 0]] }), /3 a 200/);
  assert.throws(() => parseGeometriaZona({ pontos: Array.from({ length: 201 }, (_, i) => [i, i * i]) }), /3 a 200/);
  assert.throws(() => parseGeometriaZona({ pontos: [[0, 0], [1, 0], [2, 0]] }), /área/);
  assert.throws(() => parseGeometriaZona({ pontos: [[0, 0], [10, 0], [0, 0], [0, 10]] }), /repetidos/);
  assert.throws(() => parseGeometriaZona({ pontos: [[0, 0], [10, 0], [0, 'x']] }), /vértice 3/);
  assert.throws(() => parseGeometriaZona({ pontos: [[0, 0], [10, 0], [0, 2e6]] }), /vértice 3/);
  assert.throws(() => parseGeometriaZona({ pontos: [[0, 0], [10, 0], [0, 10, 1]] }), /Vértice 3/);
});

test('rotas espaciais exigem token Bearer', async () => {
  const app = createApp({
    port: 3333, supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'sb_publishable_test', corsOrigins: ['http://localhost:5173'],
  });
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Porta HTTP indisponível.');
    const base = `http://127.0.0.1:${address.port}`;
    const zona = '5a61dabf-08c8-4ee1-9de7-1a134751f6bb';
    for (const [method, path] of [
      ['GET', '/api/iot/localizacoes/recentes'], ['GET', '/api/iot/referencia-espacial'],
      ['PUT', '/api/iot/referencia-espacial'], ['GET', '/api/iot/zonas/geometrias'],
      ['PUT', `/api/iot/zonas/${zona}/geometria`], ['DELETE', `/api/iot/zonas/${zona}/geometria`],
    ] as const) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'PUT' ? '{}' : undefined });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
