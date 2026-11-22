"""KPIs derivados de observações. Probabilidades futuras não são tempo observado."""
from datetime import timedelta
import numpy as np
import pandas as pd
from .config import SeriesConfig, LABELS
from .localization import timestamp
from .preprocessing import frame, KEYS


def movement_intervals(rows, cfg=SeriesConfig()):
    data = frame(rows)
    intervals = []
    if data.empty:
        return intervals
    for _, group in data.groupby(KEYS):
        group = group.sort_values('observado_em').drop_duplicates('observado_em', keep=False)
        for a, b in zip(group.to_dict('records'), group.to_dict('records')[1:]):
            dt = (b['observado_em']-a['observado_em']).total_seconds()
            values = [a[k] for k in ('x_m','y_m','erro_residual_m')] + [b[k] for k in ('x_m','y_m','erro_residual_m')]
            if not np.isfinite(values).all() or not 0 < dt <= cfg.max_gap_s:
                continue
            if any(not 0 <= r['erro_residual_m'] <= cfg.max_residual_m or r['receptores_utilizados'] < 3 for r in (a,b)):
                continue
            distance = float(np.hypot(b['x_m']-a['x_m'], b['y_m']-a['y_m']))
            speed = distance / dt
            if speed > cfg.max_speed_m_s:
                continue
            # Limites heurísticos conservadores; resíduo não é intervalo de confiança.
            noise = cfg.noise_floor_m + a['erro_residual_m'] + b['erro_residual_m']
            state = 'indeterminado'
            if speed <= cfg.stationary_m_s and distance <= cfg.noise_floor_m:
                state = 'parado_aparente'
            elif speed >= cfg.moving_m_s and distance > noise:
                state = 'em_movimento_aparente'
            intervals.append(dict(inicio=a['observado_em'], fim=b['observado_em'],
                distancia_m=distance, estado=state, animal_id=a['animal_id'], propriedade_id=a['propriedade_id']))
    # Vínculos/transmissores sobrepostos não podem dobrar cobertura ou distância do animal.
    ambiguous = set()
    ordered = sorted(enumerate(intervals),key=lambda item:item[1]['inicio'])
    active = []
    for i,current in ordered:
        active = [(j,other) for j,other in active if other['fim']>current['inicio']]
        for j,other in active:
            if (other['propriedade_id'],other['animal_id'])==(current['propriedade_id'],current['animal_id']):
                ambiguous.update((i,j))
        active.append((i,current))
    return [v for i,v in enumerate(intervals) if i not in ambiguous]


def summarize_movement(rows, start, end, period='dia', cfg=SeriesConfig()):
    start, end = pd.Timestamp(timestamp(start)), pd.Timestamp(timestamp(end))
    if start >= end or period not in ('dia','semana','mes'):
        raise ValueError('periodo_invalido')
    identities = {(r['propriedade_id'],r.get('animal_id')) for r in rows}
    if len(identities) > 1:
        raise ValueError('KPI individual exige uma propriedade e um animal')
    freq = {'dia':'h','semana':'D','mes':'D'}[period]
    edges = list(pd.date_range(start.floor(freq), end.ceil(freq), freq=freq))
    points = []
    intervals = movement_intervals(rows,cfg)
    for left,right in zip(edges,edges[1:]):
        left,right = max(left,start),min(right,end)
        duration = (right-left).total_seconds()
        if duration <= 0:
            continue
        covered,distance = 0.0,0.0
        states = dict(parado_aparente=0.0,em_movimento_aparente=0.0,indeterminado=0.0)
        for interval in intervals:
            overlap = max(0,(min(interval['fim'],right)-max(interval['inicio'],left)).total_seconds())
            if overlap:
                covered += overlap
                distance += interval['distancia_m'] * overlap / (interval['fim']-interval['inicio']).total_seconds()
                states[interval['estado']] += overlap
        points.append(dict(inicio=left.isoformat(),fim=right.isoformat(),
            distancia_estimada_m=distance if covered else None,
            velocidade_media_estimada_m_s=distance/covered if covered else None,
            cobertura_percentual=min(100,100*covered/duration), segundos_observados=covered,
            segundos_movimento_aparente=states['em_movimento_aparente'],
            movimento_aparente={k:100*v/covered if covered else None for k,v in states.items()}))
    return dict(origem='derivado_rssi',periodo=period,pontos=points)


def behavior_distribution(rows, start, end, trusted_cameras, max_gap_s=120):
    """Tempo entre rótulos concordantes da mesma fonte, limitado pela cobertura."""
    if len({(r['propriedade_id'],r['animal_id']) for r in rows}) > 1:
        raise ValueError('distribuicao_exige_animal_unico')
    start,end = timestamp(start),timestamp(end)
    if end <= start:
        raise ValueError('periodo_invalido')
    valid = [r for r in rows if r.get('camera_id') in trusted_cameras
             and r.get('comportamento') in LABELS and 0.8 <= r.get('confianca',0) <= 1]
    # Fontes simultâneas conflitantes não ganham prioridade arbitrária.
    by_time = {}
    for r in valid:
        by_time.setdefault(timestamp(r['observado_em']),[]).append(r)
    times = sorted(by_time)
    seconds = dict.fromkeys(LABELS,0.0)
    for a,b in zip(times,times[1:]):
        labels = {r['comportamento'] for t in (a,b) for r in by_time[t]}
        sources = {r['camera_id'] for r in by_time[a]} & {r['camera_id'] for r in by_time[b]}
        if len(labels)==1 and sources and 0 < (b-a).total_seconds() <= max_gap_s:
            seconds[next(iter(labels))] += max(0,(min(b,end)-max(a,start)).total_seconds())
    covered = sum(seconds.values())
    return dict(origem='observado_validado',disponivel=covered>0,
        cobertura_percentual=100*covered/(end-start).total_seconds(),
        percentuais={k:100*v/covered if covered else None for k,v in seconds.items()})


def receiver_summary(device, detections, now, offline_after_s=120):
    rows = [r for r in detections if r['receptor_id']==device['id'] and r['propriedade_id']==device['propriedade_id']]
    now = timestamp(now)
    times = [timestamp(r['recebido_em']) for r in rows]
    last = max(times) if times else None
    recent = [r for r in rows if 0 <= (now-timestamp(r['recebido_em'])).total_seconds() <= offline_after_s]
    return dict(receptor_id=device['id'], status='recebendo_recentemente' if recent else 'sem_deteccoes_recentes',
        ultima_recepcao_em=last.isoformat() if last else None,
        rssi_beacons_medio_dbm=float(np.mean([r['rssi_dbm'] for r in recent])) if recent else None,
        registros_24h=sum(0 <= (now-t).total_seconds() < 86400 for t in times),
        modelo_hardware=None,bateria_receptor_percentual=None,perdas_de_sinal=None)
