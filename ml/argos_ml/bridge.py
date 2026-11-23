"""Ponte stdin/stdout para a API existente. Sem servidor, rede, credenciais ou TensorFlow."""
import json
import sys
import numpy as np
from .config import SeriesConfig
from .kpis import summarize_movement, behavior_distribution
from .localization import timestamp


def report(payload: dict) -> dict:
    prop,animal=payload['propriedade_id'],payload['animal_id']
    rows=payload['localizacoes']; labels=payload.get('rotulos',[])
    if len(rows)>10000 or len(labels)>10000:
        raise ValueError('limite_de_amostras')
    if any(r['propriedade_id']!=prop or r['animal_id']!=animal for r in rows+labels):
        raise ValueError('escopo_incompativel')
    start,end=timestamp(payload['inicio']),timestamp(payload['fim'])
    if not start or not end or not 0<(end-start).total_seconds()<=31*86400:
        raise ValueError('intervalo_invalido')
    cfg=SeriesConfig.environment()
    movement=summarize_movement(rows,start,end,payload.get('periodo','dia'),cfg)
    points=movement['pontos']
    covered=sum(p['segundos_observados'] for p in points)
    selected=[r for r in rows if r.get('observado_em') and start<=timestamp(r['observado_em'])<end]
    residuals=[float(r['erro_residual_m']) for r in selected if np.isfinite(r['erro_residual_m'])]
    return dict(movimentacao=movement,
        resumo=dict(distancia_estimada_m=sum(p['distancia_estimada_m'] or 0 for p in points) if covered else None,
            velocidade_media_estimada_m_s=sum(p['distancia_estimada_m'] or 0 for p in points)/covered if covered else None,
            segundos_repouso_aparente=sum(p['segundos_repouso_aparente'] for p in points) if covered else None,
            segundos_movimento_aparente=sum(p['segundos_movimento_aparente'] for p in points) if covered else None,
            cobertura_percentual=100*covered/(end-start).total_seconds(),
            localizacoes=len(selected),rms_medio_m=float(np.mean(residuals)) if residuals else None),
        comportamentos=behavior_distribution(labels,start,end,payload.get('trusted_cameras',[]),cfg.max_gap_s))


if __name__=='__main__':
    try:
        raw=sys.stdin.buffer.read(8*1024*1024+1)
        if len(raw)>8*1024*1024:raise ValueError('entrada_excessiva')
        print(json.dumps(report(json.loads(raw)),allow_nan=False))
    except Exception:
        print(json.dumps({'error':'analise_indisponivel'}))
        raise SystemExit(1) from None
