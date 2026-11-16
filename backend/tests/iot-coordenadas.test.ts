import assert from 'node:assert/strict';
import test from 'node:test';
import { coordenadasBody } from '../src/models/iot.model.js';
const valid = { receptor_id: '9b3cc23c-7c82-4105-96ad-9e6ee7d7c607', x_m: 0, y_m: 100,
  rssi_1m_dbm: -50, expoente_perda: 2.6 };
test('calibração aceita origem e rejeita não finitos, limites e propriedade fornecida pelo cliente', () => {
  assert.deepEqual(coordenadasBody(valid), valid);
  for (const patch of [{ x_m: NaN }, { y_m: Infinity }, { expoente_perda: 0 },
    { rssi_1m_dbm: 1 }, { propriedade_id: 'outra' }, { receptor_id: 'RX-001' }, { x_m: '0' }]) {
    assert.throws(() => coordenadasBody({ ...valid, ...patch }));
  }
});
