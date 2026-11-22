import hashlib
import json
import time
from datetime import timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5
import numpy as np
from .config import SeriesConfig, LABELS
from .preprocessing import FEATURES, features
from .localization import timestamp


class Predictor:
    def __init__(self, directory=None):
        self.model, self.meta, self.status = None, None, 'nao_configurado'
        if not directory:
            return
        path = Path(directory)
        try:
            m = json.loads((path/'manifest.json').read_text())
            self.meta = m
            if not m.get('approved') or m.get('synthetic', True) or not m.get('reviewed_real_data'):
                self.status = 'nao_aprovado'
                return
            if m['schema_version'] != 1 or m['features'] != FEATURES or m['labels'] != LABELS:
                raise ValueError('contrato_modelo_incompativel')
            if m['task'] not in ('position', 'behavior') or not m['improves_baseline']:
                raise ValueError('modelo_nao_validado')
            self.cfg = SeriesConfig(**m['config'])
            if hashlib.sha256((path/'model.keras').read_bytes()).hexdigest() != m['model_sha256']:
                raise ValueError('modelo_alterado')
            for name, size in [('feature_mean',len(FEATURES)),('feature_scale',len(FEATURES))] + (
                    [('target_mean',2),('target_scale',2)] if m['task']=='position' else []):
                a = np.asarray(m[name])
                if a.shape != (size,) or not np.isfinite(a).all() or ('scale' in name and (a <= 0).any()):
                    raise ValueError('scaler_invalido')
            import tensorflow as tf
            self.model = tf.keras.models.load_model(path/'model.keras', compile=False)
            self.status = 'disponivel'
        except Exception:
            self.model = None
            self.status = 'modelo_invalido_ou_tensorflow_indisponivel'

    def predict(self, rows, property_id):
        if self.model is None or property_id != self.meta['property_id']:
            return None
        identities = {(r.get('propriedade_id'),r.get('animal_id'),r.get('transmissor_id')) for r in rows}
        if len(identities) != 1 or any(p != property_id or a is None or t is None for p,a,t in identities):
            return None
        f = features(rows, self.cfg)
        if len(f) < self.cfg.steps:
            return None
        window = f.tail(self.cfg.steps)
        if any(window[k].nunique() != 1 for k in ['propriedade_id','animal_id','transmissor_id','segment']):
            return None
        # Não prevê a partir de prefixo antigo se a observação mais recente foi rejeitada.
        last_raw = max(timestamp(r['observado_em']) for r in rows if r.get('observado_em'))
        if last_raw.timestamp() // self.cfg.interval_s != window.iloc[-1].observado_em.timestamp() // self.cfg.interval_s:
            return None
        x = (window[FEATURES].to_numpy() - self.meta['feature_mean']) / self.meta['feature_scale']
        if not np.isfinite(x).all():
            return None
        start = time.perf_counter()
        value = np.asarray(self.model(x.astype('float32')[None], training=False))[0]
        expected = 2 if self.meta['task'] == 'position' else 4
        if value.shape != (expected,) or not np.isfinite(value).all():
            return None
        row = window.iloc[-1]
        result = dict(propriedade_id=property_id, animal_id=row.animal_id, evento_id=row.evento_id,
            observado_em=row.observado_em.isoformat(),
            previsto_para=(row.observado_em + timedelta(seconds=self.cfg.horizon_s)).isoformat(),
            atual_x_m=float(row.x_m), atual_y_m=float(row.y_m),
            modelo_versao=self.meta['model_version'], comportamento=None, confianca=None,
            probabilidades=None, proximo_x_m=None, proximo_y_m=None)
        if self.meta['task'] == 'position':
            value = value * self.meta['target_scale'] + self.meta['target_mean']
            if not np.isfinite(value).all():
                return None
            result.update(proximo_x_m=float(value[0]), proximo_y_m=float(value[1]))
        else:
            if (value < 0).any() or not np.isclose(value.sum(),1,atol=1e-5):
                return None
            result.update(comportamento=LABELS[int(value.argmax())], confianca=float(value.max()),
                          probabilidades=dict(zip(LABELS, map(float, value))))
        self.meta['inference_time_ms'] = (time.perf_counter()-start)*1000
        identity = ':'.join(str(result[k]) for k in ('propriedade_id','animal_id','evento_id','modelo_versao'))
        result['id'] = str(uuid5(NAMESPACE_URL, identity))
        from datetime import datetime, timezone
        result['criado_em'] = datetime.now(timezone.utc).isoformat()
        return result
