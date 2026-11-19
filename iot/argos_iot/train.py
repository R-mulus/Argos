"""CSV supervisionado: propriedade/animal/tempo, RSSI, trilateração e referência medida."""
import argparse
import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

LABELS = ['parado', 'andando', 'correndo', 'alimentando', 'bebendo', 'deitado', 'outro']


def dataset(path, receivers, steps, interval, property_id):
    grouped = defaultdict(list)
    with open(path, encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f):
            if r['propriedade_id'] != property_id:
                raise ValueError('Treinamento não pode misturar sistemas de coordenadas/propriedades')
            if r['fonte_referencia'] not in ('levantamento', 'camera_calibrada', 'gnss_referencia'):
                raise ValueError('Informe referência independente; RSSI não é ground truth')
            at = datetime.fromisoformat(r['timestamp'].replace('Z', '+00:00'))
            if at.tzinfo is None:
                raise ValueError('Timestamp exige fuso horário')
            feature = [float(r['rssi_' + rx]) for rx in receivers] + [float(r['rssi_x_m']), float(r['rssi_y_m'])]
            target = [float(r['referencia_x_m']), float(r['referencia_y_m'])]
            if not np.isfinite(feature + target).all() or any(not -127 <= v <= 0 for v in feature[:-2]):
                raise ValueError('Leitura não finita ou RSSI inválido')
            grouped[r['animal_id']].append((at, feature, target, LABELS.index(r['comportamento'])))
    times = sorted({r[0] for values in grouped.values() for r in values})
    if len(times) < 30:
        raise ValueError('Coleta insuficiente para separar treino/validação/teste')
    cuts = (times[int(len(times) * .6)], times[int(len(times) * .8)])
    splits = [[], [], []]
    for rows in grouped.values():
        rows.sort(key=lambda r: r[0])
        if len({r[0] for r in rows}) != len(rows):
            raise ValueError('Timestamp duplicado por animal')
        for end in range(steps - 1, len(rows) - 1):
            window = rows[end - steps + 1:end + 2]
            if any(abs((b[0] - a[0]).total_seconds() - interval) > interval * .2
                   for a, b in zip(window, window[1:])):
                continue
            partitions = [sum(t >= cut for cut in cuts) for t in (window[0][0], window[-1][0])]
            # Descartar TODA janela que cruza corte: não vazar amostras sobrepostas.
            if partitions[0] != partitions[1]:
                continue
            splits[partitions[0]].append((np.array([r[1] for r in window[:-1]]),
                                         rows[end][2], rows[end + 1][2], rows[end][3]))
    if any(len(s) < 10 for s in splits):
        raise ValueError('Cada partição temporal precisa de >=10 sequências independentes do corte')
    return splits


def train(args):
    if not 2 <= args.steps <= 256 or not 1 <= args.interval <= 3600 or len(set(args.receivers)) < 3:
        raise ValueError('Configuração de sequência inválida')
    import tensorflow as tf
    tf.keras.utils.set_random_seed(42)
    splits = dataset(args.csv, args.receivers, args.steps, args.interval, args.property)
    arrays = [(np.stack([r[0] for r in s]).astype('float32'),
               np.asarray([r[1] for r in s], dtype='float32'),
               np.asarray([r[2] for r in s], dtype='float32'),
               np.asarray([r[3] for r in s])) for s in splits]
    mean = arrays[0][0].mean(axis=(0, 1)); std = np.maximum(arrays[0][0].std(axis=(0, 1)), 1)
    origin = arrays[0][1].mean(axis=0); scale = np.maximum(arrays[0][1].std(axis=0), 1)
    def normalized(a):
        x, current, future, behavior = a
        return (x - mean) / std, {'current_xy': (current - origin) / scale,
            'next_xy': (future - origin) / scale, 'behavior': behavior}
    inputs = tf.keras.Input((args.steps, len(args.receivers) + 2))
    hidden = tf.keras.layers.GRU(32)(inputs)
    hidden = tf.keras.layers.Dropout(.15)(hidden)
    model = tf.keras.Model(inputs, {
        'current_xy': tf.keras.layers.Dense(2, name='current_xy')(hidden),
        'next_xy': tf.keras.layers.Dense(2, name='next_xy')(hidden),
        'behavior': tf.keras.layers.Dense(len(LABELS), activation='softmax', name='behavior')(hidden)})
    model.compile(optimizer='adam', loss={'current_xy': 'mse', 'next_xy': 'mse',
                                        'behavior': 'sparse_categorical_crossentropy'})
    model.fit(*normalized(arrays[0]), validation_data=normalized(arrays[1]), epochs=args.epochs,
              batch_size=32, callbacks=[tf.keras.callbacks.EarlyStopping(patience=8, restore_best_weights=True)])
    x, current, future, labels = arrays[2]
    result = {k: np.asarray(v) for k, v in model((x - mean) / std, training=False).items()}
    def mae(a, b): return float(np.linalg.norm(a - b, axis=1).mean())
    metrics = dict(current_mae_m=mae(result['current_xy'] * scale + origin, current),
        rssi_mae_m=mae(x[:, -1, -2:], current), next_mae_m=mae(result['next_xy'] * scale + origin, future),
        persistence_mae_m=mae(x[:, -1, -2:], future),
        behavior_accuracy=float(np.mean(np.argmax(result['behavior'], axis=1) == labels)))
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    model.save(out / 'argos_gru.keras')
    meta = dict(schema_version=2, version=datetime.now(timezone.utc).strftime('gru-%Y%m%dT%H%M%SZ'),
        property_id=args.property, steps=args.steps, interval_s=args.interval,
        receivers=args.receivers, labels=LABELS, feature_mean=mean.tolist(), feature_std=std.tolist(),
        xy_mean=origin.tolist(), xy_std=scale.tolist(), metrics=metrics,
        partitions=[len(s) for s in splits], parameters=model.count_params(),
        aprovado=False, receiver_configuration={},
        supera_baselines=metrics['current_mae_m'] < metrics['rssi_mae_m'] and metrics['next_mae_m'] < metrics['persistence_mae_m'])
    (out / 'metadata.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    print('Modelo experimental salvo. Aprovação requer avaliação de campo; ver README.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('csv'); parser.add_argument('--property', required=True)
    parser.add_argument('--receivers', nargs='+', required=True, help='UUIDs em ordem fixa')
    parser.add_argument('--steps', type=int, default=16); parser.add_argument('--interval', type=float, default=30)
    parser.add_argument('--epochs', type=int, default=60); parser.add_argument('--out', default='model')
    train(parser.parse_args())
