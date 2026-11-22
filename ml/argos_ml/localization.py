"""Trilateração por mínimos quadrados robustos. Resíduo não é precisão física."""
from datetime import datetime, timezone
from uuid import uuid5, NAMESPACE_URL
import numpy as np
from scipy.optimize import least_squares


class InvalidEvent(ValueError):
    pass


def timestamp(value):
    if value is None:
        return None
    t = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace('Z', '+00:00'))
    if t.tzinfo is None:
        raise InvalidEvent('horario_sem_fuso')
    return t.astimezone(timezone.utc)


def distance_rssi(rssi, reference, exponent):
    if not np.isfinite([rssi, reference, exponent]).all() or not (-127 <= rssi <= 0 and -100 <= reference <= -10 and 1 <= exponent <= 6):
        raise InvalidEvent('rssi_ou_calibracao_invalida')
    distance = 10 ** ((reference - rssi) / (10 * exponent))
    if not 0.01 <= distance <= 100_000:
        raise InvalidEvent('distancia_fora_do_limite')
    return distance


def trilaterate(samples):
    if len(samples) < 3:
        raise InvalidEvent('receptores_insuficientes')
    p = np.array([[s['x_m'], s['y_m']] for s in samples], dtype=float)
    if not np.isfinite(p).all():
        raise InvalidEvent('coordenadas_invalidas')
    singular = np.linalg.svd(p - p.mean(axis=0), compute_uv=False)
    if singular[0] == 0 or singular[1] / singular[0] < 0.01:
        raise InvalidEvent('geometria_degenerada')
    d = np.array([distance_rssi(s['rssi_dbm'], s['rssi_1m_dbm'], s['expoente_perda']) for s in samples])
    # Solução linear inicial; refinamento robusto reduz influência de distâncias discrepantes.
    a = 2 * (p[1:] - p[0])
    b = d[0] ** 2 - d[1:] ** 2 + (p[1:] ** 2).sum(axis=1) - (p[0] ** 2).sum()
    initial = np.linalg.lstsq(a, b, rcond=None)[0]
    fit = least_squares(lambda xy: np.linalg.norm(xy - p, axis=1) - d,
                        initial, loss='soft_l1', f_scale=3.0, max_nfev=300)
    if not fit.success or not np.isfinite(fit.x).all():
        raise InvalidEvent('ajuste_nao_convergiu')
    return dict(x_m=float(fit.x[0]), y_m=float(fit.x[1]),
                erro_residual_m=float(np.sqrt(np.mean(fit.fun ** 2))), receptores_utilizados=len(samples))


def localize(rows, coordinates, links):
    identities = {(r['propriedade_id'], r['transmissor_id'], r['evento_id']) for r in rows}
    if len(identities) != 1:
        raise InvalidEvent('eventos_misturados_ou_vazios')
    property_id, transmitter, event = next(iter(identities))
    receivers = [r['receptor_id'] for r in rows]
    if len(set(receivers)) != len(receivers):
        raise InvalidEvent('receptor_duplicado')
    calibration = {c['receptor_id']: c for c in coordinates if c['propriedade_id'] == property_id}
    selected = [r for r in rows if r['receptor_id'] in calibration]
    if len(selected) < 3:
        raise InvalidEvent('receptores_calibrados_insuficientes')
    dates = [timestamp(r.get('detectado_em')) for r in selected]
    # Sem relógio válido podemos localizar o beacon, mas não atribuir animal/tempo histórico.
    observed = min(dates) if all(t is not None for t in dates) else None
    if observed and (max(dates) - observed).total_seconds() > 2:
        raise InvalidEvent('horarios_incompativeis')
    matches = [] if observed is None else [v for v in links
        if v['propriedade_id'] == property_id and v['transmissor_id'] == transmitter
        and timestamp(v['inicio_em']) <= observed
        and (v.get('fim_em') is None or observed < timestamp(v['fim_em']))]
    if len(matches) > 1:
        raise InvalidEvent('vinculo_historico_ambiguo')
    if observed and any(r.get('vinculo_id') and (not matches or r['vinculo_id'] != matches[0]['id']) for r in selected):
        raise InvalidEvent('vinculo_historico_incompativel')
    samples = [{**calibration[r['receptor_id']], 'rssi_dbm': r['rssi_dbm']} for r in sorted(selected, key=lambda r: r['receptor_id'])]
    return dict(id=str(uuid5(NAMESPACE_URL, ':'.join([property_id, transmitter, event]))),
                propriedade_id=property_id, transmissor_id=transmitter, evento_id=event,
                animal_id=matches[0]['animal_id'] if matches else None,
                observado_em=observed.isoformat() if observed else None,
                calculado_em=datetime.now(timezone.utc).isoformat(), **trilaterate(samples))
