"""Previsão direta de presença por zona, em dias UTC; não rotula ações do animal."""
import argparse
import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

SCHEMA = 1
STEPS = 30
HORIZON = 30
MIN_COVERAGE = .5


def series(rows, zones):
    """Ausência de coleta não vira ausência do animal. Dias ruins quebram sequências."""
    grouped = defaultdict(dict)
    for row in rows:
        day = row['dia'] if isinstance(row['dia'], date) else date.fromisoformat(row['dia'])
        counts = row['contagens']
        if isinstance(counts, str):
            counts = json.loads(counts)
        if set(counts) - set(zones):
            raise ValueError('Zona fora do vocabulário do modelo; retreine após alterar zonas')
        values = np.array([counts.get(z, 0) for z in zones], dtype='float32')
        if not np.isfinite(values).all() or (values < 0).any() or (values != np.floor(values)).any():
            raise ValueError('Contagens inválidas')
        total = float(values.sum())
        if total > 288:
            raise ValueError('Mais de uma zona por intervalo de cinco minutos')
        animal = str(row['animal_id'])
        if day in grouped[animal]:
            raise ValueError('Dia duplicado por animal')
        grouped[animal][day] = None if total < 288 * MIN_COVERAGE else values / total
    return grouped


def features(days, values):
    # Calendário conhecido no instante da previsão; sem rótulos futuros na entrada.
    calendar = [[np.sin(2*np.pi*d.weekday()/7), np.cos(2*np.pi*d.weekday()/7)] for d in days]
    return np.concatenate([np.asarray(values), np.asarray(calendar)], axis=1).astype('float32')


def partitions(grouped):
    days = sorted({d for animal in grouped.values() for d in animal})
    if len(days) < 300:
        raise ValueError('Histórico insuficiente: mínimo técnico de 300 dias para cortes temporais de 30+30 dias')
    cuts = [days[int(len(days)*.6)], days[int(len(days)*.8)]]
    splits = [[], [], []]
    for animal in grouped.values():
        for start in sorted(animal):
            window = [start + timedelta(days=i) for i in range(STEPS+HORIZON)]
            if any(animal.get(d) is None for d in window):
                continue
            a, b = [sum(d >= cut for cut in cuts) for d in (window[0], window[-1])]
            if a != b:
                continue
            values = [animal[d] for d in window]
            splits[a].append((features(window[:STEPS], values[:STEPS]), np.array(values[STEPS:])))
    if any(not s for s in splits):
        raise ValueError('Faltam sequências completas em treino, validação ou teste')
    return [(np.stack([r[0] for r in s]), np.stack([r[1] for r in s])) for s in splits]


def train(rows, zones, property_id, output, epochs=60):
    if not zones or len(set(zones)) != len(zones) or epochs < 1:
        raise ValueError('Zonas/épocas inválidas')
    arrays = partitions(series(rows, zones))
    import tensorflow as tf
    tf.keras.utils.set_random_seed(42)
    inputs = tf.keras.Input((STEPS, len(zones)+2))
    hidden = tf.keras.layers.GRU(64)(inputs)
    hidden = tf.keras.layers.Dropout(.2)(hidden)
    logits = tf.keras.layers.Dense(HORIZON*len(zones))(hidden)
    outputs = tf.keras.layers.Softmax(axis=-1)(tf.keras.layers.Reshape((HORIZON, len(zones)))(logits))
    model = tf.keras.Model(inputs, outputs)
    model.compile(optimizer='adam', loss='categorical_crossentropy')
    model.fit(*arrays[0], validation_data=arrays[1], epochs=epochs, batch_size=32,
              callbacks=[tf.keras.callbacks.EarlyStopping(patience=8, restore_best_weights=True)])
    x, y = arrays[2]
    predicted = np.asarray(model(x, training=False))
    persistence = np.repeat(x[:, -1:, :len(zones)], HORIZON, axis=1)
    weekly = np.stack([x[:, STEPS-7+i % 7, :len(zones)] for i in range(HORIZON)], axis=1)
    errors = {name: np.abs(value-y).mean(axis=(0, 2)).tolist()
              for name, value in [('gru', predicted), ('persistencia', persistence), ('semanal', weekly)]}
    out = Path(output)
    out.mkdir(parents=True, exist_ok=True)
    model.save(out/'habitos.keras')
    meta = dict(schema_version=SCHEMA, property_id=str(property_id), zones=zones, steps=STEPS,
                horizon=HORIZON, timezone='UTC', min_coverage=MIN_COVERAGE,
                version=datetime.now(timezone.utc).strftime('habitos-%Y%m%dT%H%M%S%fZ'),
                aprovado=False, mae_por_horizonte=errors, amostras=[len(a[0]) for a in arrays],
                supera_baselines=all(np.mean(errors['gru']) < np.mean(errors[k])
                                     for k in ('persistencia', 'semanal')))
    (out/'habitos.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    return meta


class ModeloHabitos:
    def __init__(self, directory):
        self.model = None
        self.meta = None
        if not directory:
            return
        path = Path(directory)
        m = json.loads((path/'habitos.json').read_text(encoding='utf-8'))
        if (m['schema_version'] != SCHEMA or m['steps'] != STEPS or m['horizon'] != HORIZON
                or m['timezone'] != 'UTC' or m['min_coverage'] != MIN_COVERAGE
                or not m['zones'] or len(set(m['zones'])) != len(m['zones'])):
            raise ValueError('Manifesto de hábitos incompatível')
        self.meta = m
        if m.get('aprovado') is not True:
            return
        import tensorflow as tf
        self.model = tf.keras.models.load_model(path/'habitos.keras', compile=False, safe_mode=True)

    def predict(self, rows, property_id, today=None):
        if self.model is None or str(property_id) != self.meta['property_id']:
            return []
        today = today or datetime.now(timezone.utc).date()
        days = [today-timedelta(days=STEPS-i) for i in range(STEPS)]
        zones = self.meta['zones']
        result = []
        for animal, history in series(rows, zones).items():
            if any(history.get(d) is None for d in days):
                continue
            x = features(days, [history[d] for d in days])
            probs = np.asarray(self.model(x[None], training=False))[0]
            if (probs.shape != (HORIZON, len(zones)) or not np.isfinite(probs).all()
                    or (probs < 0).any() or not np.allclose(probs.sum(axis=1), 1, atol=1e-5)):
                raise ValueError('Saída do modelo inválida')
            result.append(dict(animal_id=animal, observado_em=days[-1].isoformat(),
                modelo_versao=self.meta['version'], previsoes=[dict(dia=(today+timedelta(days=i)).isoformat(),
                proporcoes=dict(zip(zones, map(float, p)))) for i, p in enumerate(probs)]))
        return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data', help='JSON exportado por habitos_worker')
    parser.add_argument('--out', required=True)
    parser.add_argument('--epochs', type=int, default=60)
    args = parser.parse_args()
    data = json.loads(Path(args.data).read_text(encoding='utf-8'))
    train(data['rows'], data['zones'], data['property_id'], args.out, args.epochs)
