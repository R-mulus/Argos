"""Diagnóstico administrativo somente leitura da coleta, independente da interface."""
from collections import Counter, defaultdict
from .config import SeriesConfig
from .preprocessing import chronological_split, sequences


def collection_report(db,start,end,cfg=None):
    cfg=cfg or SeriesConfig.environment()
    bounds=f'(recebido_em.gte.{start.isoformat()},recebido_em.lt.{end.isoformat()})'
    detections=db.rows('deteccoes',**{'and':bounds})
    groups=defaultdict(set)
    for r in detections:groups[(r['transmissor_id'],r['evento_id'])].add(r['receptor_id'])
    jobs=db.rows('argos_iot_jobs',order='transmissor_id,evento_id')
    locations=db.rows('argos_localizacoes',**{'and':f'(observado_em.gte.{start.isoformat()},observado_em.lt.{end.isoformat()})'})
    eligible=[r for r in locations if r.get('animal_id') and r.get('observado_em')
              and r.get('referencial_versao') and r.get('calibracao_sha256') and r.get('origem')]
    # Um relatório por referencial: não estima janelas misturando geometrias/calibrações.
    references=defaultdict(list)
    for r in eligible:references[(r['referencial_versao'],r['calibracao_sha256'],r['origem'])].append(r)
    windows=[]
    for (version,sha,source),rows in references.items():
        try:counts=[len(sequences(part,cfg)[0]) for part in chronological_split(rows)]
        except ValueError:counts=[0,0,0]
        windows.append(dict(referencial=version,calibracao_sha256=sha,origem=source,
                            treino=counts[0],validacao=counts[1],teste=counts[2]))
    states=Counter(j['estado'] for j in jobs)
    return dict(inicio=start.isoformat(),fim=end.isoformat(),deteccoes=len(detections),
        eventos_unicos=len(groups),eventos_tres_receptores=sum(len(v)>=3 for v in groups.values()),
        deteccoes_sem_timestamp=sum(not r.get('detectado_em') for r in detections),
        deteccoes_sem_vinculo=sum(not r.get('vinculo_id') for r in detections),
        localizacoes_periodo=len(locations),posicoes_com_proveniencia=len(eligible),
        ultima_localizacao_calculada_em=max((r.get('calculado_em') or '' for r in locations),default='') or None,
        ultimo_job_atualizado_em=max((j.get('atualizado_em') or '' for j in jobs),default='') or None,
        jobs_propriedade=dict(states),jobs_pendentes=states['pendente'],
        jobs_rejeitados=sum(n for state,n in states.items() if state not in ('pendente','localizado')),
        janelas_por_referencial=windows,
        aviso='Jobs são fotografia atual da propriedade; detecções usam recebido_em, posições usam observado_em. Janelas sobrepostas não são amostras independentes.')
