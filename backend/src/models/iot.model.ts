import { objectBody, uuidParam } from '../lib/validation.js';
import { ApiError } from '../lib/http.js';

export function coordenadasBody(value: unknown) {
  const b = objectBody(value, ['receptor_id', 'x_m', 'y_m', 'rssi_1m_dbm', 'expoente_perda']);
  const number = (key: string, min: number, max: number) => {
    const value = b[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new ApiError(400, `${key} deve ser número entre ${min} e ${max}.`);
    }
    return value;
  };
  return { receptor_id: uuidParam(b.receptor_id, 'receptor_id'),
    x_m: number('x_m', -1e6, 1e6), y_m: number('y_m', -1e6, 1e6),
    rssi_1m_dbm: number('rssi_1m_dbm', -100, -10), expoente_perda: number('expoente_perda', 1, 6) };
}
