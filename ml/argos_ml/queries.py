"""Consultas reutilizáveis pelo backend; Database deve receber propriedade autorizada."""
from datetime import timedelta
from uuid import UUID
from .localization import timestamp
from .kpis import summarize_movement,behavior_distribution,receiver_summary


def animal_report(db, animal_id, start, end, period='dia', trusted_cameras=()):
    animal_id=str(UUID(animal_id)); start,end=timestamp(start),timestamp(end)
    if not start or not end or start>=end:raise ValueError('periodo_invalido')
    animals=db.rows('animais',id='eq.'+animal_id)
    if not animals:return None
    animal=animals[0]
    bounds=f'(observado_em.gte.{(start-timedelta(seconds=120)).isoformat()},observado_em.lte.{(end+timedelta(seconds=120)).isoformat()})'
    locations=db.rows('argos_localizacoes',animal_id='eq.'+animal_id,**{'and':bounds,'order':'observado_em,id'})
    observations=db.rows('argos_observacoes_visao',animal_id='eq.'+animal_id,**{'and':bounds,'order':'observado_em,id'})
    weights=db.rows('pesagens',animal_id='eq.'+animal_id,data_pesagem='lte.'+end.date().isoformat(),order='data_pesagem.desc')
    movement=summarize_movement(locations,start,end,period)
    points=movement['pontos'];covered=sum(p['segundos_observados'] for p in points)
    birth=animal.get('data_nascimento')
    from datetime import date
    age=(end.date()-date.fromisoformat(birth)).days if birth else None
    return dict(animal_id=animal_id,identificacao=animal['identificacao'],sexo=animal.get('sexo'),raca=animal.get('raca'),
        idade_dias=age if age is not None and age>=0 else None,
        peso_kg=float(weights[0]['peso_kg']) if weights else None,
        peso_medido_em=weights[0]['data_pesagem'] if weights else None,
        distancia_estimada_m=sum(p['distancia_estimada_m'] or 0 for p in points) if covered else None,
        segundos_movimento_aparente=sum(p['segundos_movimento_aparente'] for p in points) if covered else None,
        cobertura_percentual=100*covered/(end-start).total_seconds(),movimentacao=movement,
        comportamentos=behavior_distribution(observations,start,end,trusted_cameras),
        precisao_real=None)


def receivers_report(db, now):
    now=timestamp(now)
    devices=db.rows('dispositivos',tipo='eq.receptor')
    detections=db.rows('deteccoes',recebido_em='gte.'+(now-timedelta(days=1)).isoformat())
    return [receiver_summary(device,detections,now) for device in devices]
