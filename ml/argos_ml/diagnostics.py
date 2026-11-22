"""Ensaio pontual somente leitura; não consome fila nem executa inferência."""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
import logging
from .localization import localize, InvalidEvent


def diagnose(db, min_receivers=3):
    if min_receivers < 3:
        raise ValueError('Diagnóstico exige ao menos três receptores')
    now = datetime.now(timezone.utc).isoformat()
    # rows pagina todos os pendentes disponíveis, sem o limite normal de 50 jobs.
    jobs = db.rows('argos_iot_jobs', estado='eq.pendente', disponivel_em='lte.'+now,
                   order='disponivel_em,transmissor_id,evento_id')
    coordinates = db.rows('argos_posicoes_receptores', order='receptor_id')
    calibration = {c['receptor_id']: c for c in coordinates if c['propriedade_id']==db.property_id}
    devices = db.rows('dispositivos', select='id,codigo,propriedade_id')
    names = {d['id']: d['codigo'] for d in devices if d['propriedade_id']==db.property_id}
    links = db.rows('vinculos')
    # Snapshot paginado da propriedade, somente nesta execução de diagnóstico.
    # Evita uma consulta HTTP por job; não é usado pelo polling normal.
    groups = defaultdict(list)
    for row in db.rows('deteccoes'):
        if row['propriedade_id']==db.property_id:
            groups[(row['transmissor_id'],row['evento_id'])].append(row)
    reports, counts = [], Counter()
    scanned = 0
    for job in jobs:
        if job['propriedade_id'] != db.property_id:
            continue
        scanned += 1
        rows = groups.get((job['transmissor_id'],job['evento_id']), [])
        calibrated = {r['receptor_id'] for r in rows if r['receptor_id'] in calibration}
        if len(calibrated) < min_receivers:
            counts['abaixo_do_minimo_calibrado'] += 1
            continue
        report = dict(evento_id=job['evento_id'], transmissor_id=job['transmissor_id'],
            propriedade_id=db.property_id, somente_leitura=True,
            uso='diagnostico_numerico_nao_validado_para_producao',
            receptores=[dict(receptor_id=r['receptor_id'], codigo=names.get(r['receptor_id']),
                rssi_dbm=r['rssi_dbm'], calibrado=r['receptor_id'] in calibration,
                detectado_em=r.get('detectado_em'),
                coordenadas_calibracao={k:calibration[r['receptor_id']][k]
                    for k in ('x_m','y_m','rssi_1m_dbm','expoente_perda')}
                    if r['receptor_id'] in calibration else None)
                for r in sorted(rows,key=lambda r:r['receptor_id'])],
            posicao=None, motivo_rejeicao=None,
            avisos=['coordenadas_nao_validadas_para_producao'])
        try:
            # Mesmas validações, sem descartar duplicatas para forçar aceitação.
            position = localize(rows,coordinates,links)
            report['posicao'] = {k:position[k] for k in ('x_m','y_m','erro_residual_m',
                'receptores_utilizados','animal_id','observado_em')}
            if position['observado_em'] is None:
                report['avisos'].append('sem_horario_observado_para_serie_temporal')
            if position['animal_id'] is None:
                report['avisos'].append('sem_animal_associado_para_serie_temporal')
            counts['localizavel_sem_gravar'] += 1
        except InvalidEvent as error:
            report['motivo_rejeicao'] = str(error)
            counts[str(error)] += 1
        except (ValueError, TypeError, KeyError, OverflowError):
            report['motivo_rejeicao'] = 'dados_invalidos'
            counts['dados_invalidos'] += 1
        reports.append(report)
        logging.info('diagnostico_evento: %s',json.dumps(report,ensure_ascii=False))
    summary = dict(jobs_examinados=scanned, eventos_selecionados=len(reports),
                   min_receptores_calibrados=min_receivers, resultados=dict(counts), gravacoes=0)
    logging.info('diagnostico_resumo: %s',json.dumps(summary,ensure_ascii=False))
    return reports, summary
