"""GRU carregada uma vez. Nunca usa rótulos simulados como modelo de produção."""
import json
from pathlib import Path
import numpy as np


class ModeloGRU:
    def __init__(self, directory):
        self.model = None
        self.meta = None
        self.status = 'nao_configurado'
        if not directory:
            return
        path = Path(directory)
        self.meta = json.loads((path / 'metadata.json').read_text())
        m = self.meta
        if m.get('schema_version') != 2 or not m.get('aprovado'):
            self.status = 'nao_aprovado'
            return
        if not 2 <= m['steps'] <= 256 or not 1 <= m['interval_s'] <= 3600:
            raise ValueError('Metadados GRU inválidos')
        if len(m['receivers']) < 3 or len(set(m['receivers'])) != len(m['receivers']):
            raise ValueError('Receptores GRU inválidos')
        configuration = m.get('receiver_configuration', {})
        if set(configuration) != set(m['receivers']):
            self.status = 'configuracao_nao_validada'
            return
        for key, size in [('feature_mean', len(m['receivers']) + 2),
                          ('feature_std', len(m['receivers']) + 2), ('xy_mean', 2), ('xy_std', 2)]:
            values = np.asarray(m[key])
            if values.shape != (size,) or not np.isfinite(values).all():
                raise ValueError('Normalização GRU inválida')
            if key.endswith('std') and np.any(values <= 0):
                raise ValueError('Escala GRU inválida')
        import tensorflow as tf
        self.model = tf.keras.models.load_model(path / 'argos_gru.keras', compile=False)
        self.status = 'disponivel'

    def matches_configuration(self, rows):
        """Não reutilizar uma GRU após mover/recalibrar seus receptores."""
        expected = (self.meta or {}).get('receiver_configuration', {})
        keys = ('x_m', 'y_m', 'rssi_1m_dbm', 'expoente_perda')
        actual = {str(row['receptor_id']): {key: row[key] for key in keys} for row in rows}
        receivers = (self.meta or {}).get('receivers', [])
        return bool(receivers) and set(expected) == set(receivers) and all(
            rx in actual and expected[rx] == actual[rx] for rx in receivers)

    def predict(self, history, property_id):
        m = self.meta
        if self.model is None or str(property_id) != m['property_id']:
            return None
        history = history[-m['steps']:]
        if len(history) != m['steps']:
            return None
        if any(abs((b['observado_em'] - a['observado_em']).total_seconds() - m['interval_s'])
               > m['interval_s'] * .2 for a, b in zip(history, history[1:])):
            return None
        features = []
        for row in history:
            if not all(rx in row['rssi'] for rx in m['receivers']):
                return None
            features.append([row['rssi'][rx] for rx in m['receivers']] + [row['x_m'], row['y_m']])
        x = np.asarray(features, dtype='float32')
        if not np.isfinite(x).all():
            return None
        x = (x - m['feature_mean']) / m['feature_std']
        # Chamada direta evita criar um pipeline tf.data por inferência.
        outputs = self.model(x[None], training=False)
        current, future, behavior = [np.asarray(outputs[k])[0] for k in ('current_xy', 'next_xy', 'behavior')]
        current = current * m['xy_std'] + m['xy_mean']
        future = future * m['xy_std'] + m['xy_mean']
        if not all(np.isfinite(v).all() for v in (current, future, behavior)):
            return None
        if (behavior < 0).any() or not np.isclose(behavior.sum(), 1, atol=.001):
            return None
        index = int(np.argmax(behavior))
        return dict(atual_x_m=float(current[0]), atual_y_m=float(current[1]),
                    proximo_x_m=float(future[0]), proximo_y_m=float(future[1]),
                    comportamento=m['labels'][index], confianca=float(behavior[index]),
                    probabilidades=dict(zip(m['labels'], map(float, behavior))),
                    modelo_versao=m['version'], horizonte_s=m['interval_s'])
