"""Bins regulares sem interpolação: lacunas quebram janelas, nunca significam repouso."""
import numpy as np
import pandas as pd
from .config import SeriesConfig, LABELS

FEATURES = ['x_m', 'y_m', 'dx_m', 'dy_m', 'speed_m_s', 'dt_s',
            'erro_residual_m', 'receptores_utilizados', 'hour_sin', 'hour_cos', 'week_sin', 'week_cos']
KEYS = ['propriedade_id', 'animal_id', 'transmissor_id']


def frame(rows):
    data = pd.DataFrame(rows)
    if data.empty:
        return data
    data['observado_em'] = pd.to_datetime(data['observado_em'], utc=True, errors='coerce')
    return data.dropna(subset=KEYS + ['observado_em']).sort_values(KEYS + ['observado_em'])


def features(rows, cfg=SeriesConfig()):
    data = frame(rows)
    if data.empty:
        return pd.DataFrame(columns=KEYS + ['observado_em', 'segment'] + FEATURES)
    output = []
    for keys, group in data.groupby(KEYS, sort=True):
        group = group.copy()
        group['bin'] = group.observado_em.dt.floor(f'{cfg.interval_s}s')
        # Última observação de cada bin; não inventa observações em bins ausentes.
        g = group.groupby('bin', sort=True).tail(1).sort_values('bin').copy()
        g['observado_em'] = g['bin']
        g['dt_s'] = g.observado_em.diff().dt.total_seconds()
        g['dx_m'] = g.x_m.diff()
        g['dy_m'] = g.y_m.diff()
        g['speed_m_s'] = np.hypot(g.dx_m, g.dy_m) / g.dt_s
        quality = (np.isfinite(g[['x_m', 'y_m', 'erro_residual_m', 'receptores_utilizados']]).all(axis=1)
                   & g.erro_residual_m.between(0, cfg.max_residual_m) & (g.receptores_utilizados >= 3))
        valid = quality & quality.shift(fill_value=False) & (g.dt_s == cfg.interval_s) & g.speed_m_s.between(0, cfg.max_speed_m_s)
        g['segment'] = (~valid).cumsum()
        hours = g.observado_em.dt.hour + g.observado_em.dt.minute / 60
        g['hour_sin'], g['hour_cos'] = np.sin(hours * 2*np.pi/24), np.cos(hours * 2*np.pi/24)
        days = g.observado_em.dt.dayofweek
        g['week_sin'], g['week_cos'] = np.sin(days * 2*np.pi/7), np.cos(days * 2*np.pi/7)
        output.append(g.loc[valid])
    return pd.concat(output, ignore_index=True)


def trusted_labels(rows, cameras, cfg):
    accepted = {}
    for row in rows:
        if row.get('camera_id') not in cameras or row.get('comportamento') not in LABELS:
            continue
        if not 0.8 <= row.get('confianca', 0) <= 1:
            continue
        t = pd.to_datetime(row['observado_em'], utc=True, errors='coerce')
        if pd.isna(t):
            continue
        key = (row['propriedade_id'], row['animal_id'], t.floor(f'{cfg.interval_s}s'))
        accepted.setdefault(key, set()).add(LABELS.index(row['comportamento']))
    # Rótulos conflitantes no mesmo bin são excluídos.
    return {key: next(iter(value)) for key, value in accepted.items() if len(value) == 1}


def sequences(rows, cfg=SeriesConfig(), labels=None):
    data = features(rows, cfg)
    x, y, baseline, times = [], [], [], []
    jump = cfg.horizon_s // cfg.interval_s
    for _, group in data.groupby(KEYS + ['segment'], sort=True):
        g = group.reset_index(drop=True)
        for end in range(cfg.steps - 1, len(g) - jump):
            target = g.iloc[end + jump]
            current = g.iloc[end]
            if labels is None:
                outcome = target[['x_m', 'y_m']].to_numpy(dtype=float)
            else:
                key = (target.propriedade_id, target.animal_id, target.observado_em)
                if key not in labels:
                    continue
                outcome = labels[key]
            x.append(g.iloc[end-cfg.steps+1:end+1][FEATURES].to_numpy(dtype=float))
            y.append(outcome)
            baseline.append(current[['x_m', 'y_m']].to_numpy(dtype=float))
            times.append(target.observado_em.isoformat())
    return (np.asarray(x, dtype=np.float32).reshape(-1, cfg.steps, len(FEATURES)),
            np.asarray(y), np.asarray(baseline).reshape(-1, 2), times)


def chronological_split(rows):
    """Cortes globais por tempo ANTES de atributos/janelas: nenhum overlap entre partições."""
    data = frame(rows)
    if data.empty:
        raise ValueError('historico_insuficiente')
    times = data.observado_em.drop_duplicates().sort_values().tolist()
    if len(times) < 10:
        raise ValueError('historico_insuficiente')
    a, b = times[int(len(times)*.6)], times[int(len(times)*.8)]
    return [g.to_dict('records') for g in (data[data.observado_em < a],
        data[(data.observado_em >= a) & (data.observado_em < b)], data[data.observado_em >= b])]
