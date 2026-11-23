import hashlib
import json
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from .config import SeriesConfig, LABELS
from .models import build_gru
from .preprocessing import FEATURES, chronological_split, sequences, trusted_labels
from .datasets import verify_dataset
from .provenance import digest


def regression_metrics(actual, predicted):
    error = np.asarray(predicted) - np.asarray(actual)
    if error.ndim != 2 or error.shape[1] != 2 or not len(error) or not np.isfinite(error).all():
        raise ValueError('resultado_invalido')
    return {'mae_m': float(np.abs(error).mean()), 'rmse_m': float(np.sqrt((error**2).mean())),
            'erro_euclidiano_medio_m': float(np.linalg.norm(error, axis=1).mean())}


def save_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False), encoding='utf-8')


def train(dataset, directory, cfg=SeriesConfig(), task='position', epochs=50):
    verify_dataset(dataset)
    if epochs<1 or epochs>1000:
        raise ValueError('epocas_invalidas')
    import tensorflow as tf
    tf.config.set_visible_devices([], 'GPU')
    tf.keras.utils.set_random_seed(42)
    tf.config.experimental.enable_op_determinism()
    directory = Path(directory)
    if directory.exists() and any(directory.iterdir()):
        raise ValueError('Use um diretório novo por versão de modelo')
    directory.mkdir(parents=True, exist_ok=True)
    rows = dataset['localizacoes']
    properties = {r['propriedade_id'] for r in rows}
    if len(properties) != 1:
        raise ValueError('Treine uma propriedade/referencial por modelo')
    synthetic = dataset.get('source', '').startswith('synthetic')
    reviewed = dataset.get('source') == 'real' and dataset.get('reference',{}).get('validated') is True
    labels = trusted_labels(dataset.get('rotulos', []), dataset.get('trusted_cameras', []), cfg) if task == 'behavior' else None
    splits = [sequences(part, cfg, labels) for part in chronological_split(rows)]
    if any(len(s[0]) < 2 for s in splits):
        raise ValueError('historico_ou_rotulos_insuficientes')
    scaler = StandardScaler().fit(splits[0][0].reshape(-1, len(FEATURES)))
    xs = [((s[0] - scaler.mean_) / scaler.scale_).astype('float32') for s in splits]
    ys = [s[1] for s in splits]
    target_scaler = None
    if task == 'position':
        target_scaler = StandardScaler().fit(ys[0])
        targets = [target_scaler.transform(y).astype('float32') for y in ys]
    else:
        if set(ys[0]) != set(range(4)):
            raise ValueError('Treino precisa conter as quatro classes reais')
        targets = [y.astype('int32') for y in ys]
    model = build_gru(cfg.steps, len(FEATURES), task)
    start = time.perf_counter()
    model.fit(xs[0], targets[0], validation_data=(xs[1], targets[1]), epochs=epochs,
              batch_size=32, shuffle=False, verbose=0,
              callbacks=[tf.keras.callbacks.EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)])
    training_ms = (time.perf_counter() - start) * 1000
    start = time.perf_counter()
    output = np.asarray(model(xs[2], training=False))
    inference_ms = (time.perf_counter() - start) * 1000 / len(xs[2])
    if not np.isfinite(output).all():
        raise ValueError('resultado_nao_finito')
    if task == 'position':
        output = target_scaler.inverse_transform(output)
        evaluation = regression_metrics(ys[2], output)
        baseline = regression_metrics(ys[2], splits[2][2])
        improves = evaluation['rmse_m'] < baseline['rmse_m']
    else:
        predicted = output.argmax(axis=1)
        majority = int(np.bincount(ys[0].astype(int), minlength=4).argmax())
        evaluation = {'classification_accuracy': float(accuracy_score(ys[2], predicted)),
            'per_class': classification_report(ys[2], predicted, labels=list(range(4)), target_names=LABELS, output_dict=True, zero_division=0),
            'confusion_matrix': confusion_matrix(ys[2], predicted, labels=list(range(4))).tolist()}
        baseline = {'classification_accuracy': float(np.mean(ys[2] == majority))}
        improves = evaluation['classification_accuracy'] > baseline['classification_accuracy']
    model.save(directory / 'model.keras')
    np.savez_compressed(directory / 'heldout.npz', x=xs[2], y=ys[2], baseline=splits[2][2])
    manifest = dict(schema_version=2, model_version=directory.name, task=task, approved=False,
        synthetic=synthetic, reviewed_real_data=reviewed, property_id=next(iter(properties)), config=asdict(cfg), features=FEATURES, labels=LABELS,
        source=dataset['source'],reference=dataset.get('reference',dict(property_id=next(iter(properties)),
            version='synthetic-test-only',calibration_sha256=digest('synthetic-test-only'),validated=False)),
        seed=42,epochs_requested=epochs,batch_size=32,device='CPU',
        trained_at=datetime.now(timezone.utc).isoformat(), tensorflow_version=tf.__version__,
        model_parameters=model.count_params(), training_samples=len(xs[0]), validation_samples=len(xs[1]), test_samples=len(xs[2]),
        prediction_horizon_minutes=cfg.horizon_s/60, evaluation=evaluation, baseline=baseline, improves_baseline=bool(improves),
        training_time_ms=training_ms, inference_time_ms=inference_ms,
        feature_mean=scaler.mean_.tolist(), feature_scale=scaler.scale_.tolist(),
        target_mean=target_scaler.mean_.tolist() if target_scaler else None,
        target_scale=target_scaler.scale_.tolist() if target_scaler else None,
        split_target_ranges=[[s[3][0], s[3][-1]] for s in splits],
        dataset_sha256=hashlib.sha256(json.dumps(dataset, sort_keys=True).encode()).hexdigest(),
        model_sha256=hashlib.sha256((directory/'model.keras').read_bytes()).hexdigest())
    manifest['heldout_sha256']=hashlib.sha256((directory/'heldout.npz').read_bytes()).hexdigest()
    save_json(directory / 'manifest.json', manifest)
    return manifest


def approve(directory, reviewer):
    path = Path(directory) / 'manifest.json'
    m = json.loads(path.read_text())
    if (m['synthetic'] or not m.get('reviewed_real_data') or m.get('source')!='real'
            or not m.get('reference',{}).get('validated') or not m['improves_baseline']
            or min(m[k] for k in ('training_samples','validation_samples','test_samples')) < 30):
        raise ValueError('Modelo sintético, amostras insuficientes ou sem melhoria sobre baseline')
    if not reviewer.strip():
        raise ValueError('Identifique o responsável pela validação de campo')
    if hashlib.sha256((Path(directory)/'model.keras').read_bytes()).hexdigest() != m['model_sha256']:
        raise ValueError('Modelo alterado após avaliação')
    if hashlib.sha256((Path(directory)/'heldout.npz').read_bytes()).hexdigest()!=m['heldout_sha256']:
        raise ValueError('Teste reservado alterado após avaliação')
    m.update(approved=True, approved_by=reviewer, approved_at=datetime.now(timezone.utc).isoformat())
    save_json(path, m)


def evaluate_saved(directory):
    import tensorflow as tf
    directory=Path(directory)
    m=json.loads((directory/'manifest.json').read_text())
    for filename,key in [('model.keras','model_sha256'),('heldout.npz','heldout_sha256')]:
        if hashlib.sha256((directory/filename).read_bytes()).hexdigest()!=m[key]:
            raise ValueError('artefato_de_avaliacao_alterado')
    model=tf.keras.models.load_model(directory/'model.keras',compile=False)
    with np.load(directory/'heldout.npz',allow_pickle=False) as test:
        prediction=np.asarray(model(test['x'],training=False))
        if not np.isfinite(prediction).all():raise ValueError('resultado_nao_finito')
        if m['task']=='position':
            return regression_metrics(test['y'],prediction*m['target_scale']+m['target_mean'])
        return dict(classification_accuracy=float(accuracy_score(test['y'],prediction.argmax(axis=1))),
            confusion_matrix=confusion_matrix(test['y'],prediction.argmax(axis=1),labels=list(range(4))).tolist(),
            per_class=classification_report(test['y'],prediction.argmax(axis=1),labels=list(range(4)),
                target_names=LABELS,output_dict=True,zero_division=0))
