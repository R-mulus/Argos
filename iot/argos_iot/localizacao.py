"""Trilateração 2D em metros usando RSSI calibrado; não promete precisão GPS."""
import math
import numpy as np


def distancia_rssi(rssi: float, rssi_1m: float = -50.0, n: float = 2.6) -> float:
    """Modelo log-distância; limita uma inversão numérica excessiva."""
    if not all(math.isfinite(v) for v in (rssi, rssi_1m, n)) or not 1 <= n <= 6 or not -127 <= rssi <= 0 or not -100 <= rssi_1m <= -10:
        raise ValueError('RSSI ou expoente inválido')
    return min(100_000.0, max(0.1, 10 ** ((rssi_1m - rssi) / (10 * n))))


def trilaterar(amostras: list[dict]) -> dict:
    """Exige 3+ receptores em posições distintas não colineares.
    amostras: [{x_m,y_m,rssi_dbm,rssi_1m_dbm,expoente_perda}].
    Resíduo não equivale a erro real de localização.
    """
    if len(amostras) < 3:
        raise ValueError('São necessárias pelo menos três medidas independentes')
    p = np.asarray([[s['x_m'], s['y_m']] for s in amostras], dtype=float)
    singular = np.linalg.svd(p - p.mean(axis=0), compute_uv=False) if np.all(np.isfinite(p)) else [0, 0]
    if singular[0] == 0 or singular[1] / singular[0] < 0.01:
        raise ValueError('Receptores colineares ou coincidentes')
    dist = np.asarray([distancia_rssi(s['rssi_dbm'], s['rssi_1m_dbm'], s['expoente_perda']) for s in amostras])
    # Peso inverso suavizado: sinais muito fracos têm mais incerteza.
    weights = 1.0 / np.maximum(dist, 3.0)
    x = np.average(p, axis=0, weights=weights)
    # Gauss-Newton amortecido, sem dependências SciPy.
    for _ in range(90):
        d = np.linalg.norm(x[None, :] - p, axis=1)
        d = np.maximum(d, 0.001)
        residual = d - dist
        jac = (x[None, :] - p) / d[:, None]
        hess = jac.T @ (weights[:, None] * jac) + np.eye(2) * 1e-3
        grad = jac.T @ (weights * residual)
        step = np.linalg.solve(hess, grad)
        # Linha de busca para não divergir quando geometria for desfavorável.
        energy = float(np.sum(weights * residual ** 2))
        rate = 1.0
        while rate > 1e-3:
            trial = x - rate * step
            trial_r = np.linalg.norm(trial[None, :] - p, axis=1) - dist
            if float(np.sum(weights * trial_r ** 2)) <= energy:
                break
            rate /= 2.0
        x = x - rate * step
        if np.linalg.norm(rate * step) < 1e-5:
            break
    residual = np.linalg.norm(x[None, :] - p, axis=1) - dist
    return {
        'x_m': round(float(x[0]), 2), 'y_m': round(float(x[1]), 2),
        'erro_residual_m': round(float(math.sqrt(np.mean(residual ** 2))), 2),
        'receptores_utilizados': len(amostras),
        'aviso': 'Estimativa por RSSI; resíduo é ajuste do modelo, não acurácia real.'
    }
