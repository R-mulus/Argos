import copy
import logging
from unittest.mock import Mock
import pytest
from argos_ml.database import Database
from argos_ml.diagnostics import diagnose
from argos_ml.worker import run
from conftest import P, T


def repository(beacon, incomplete=0):
    rows, coordinates, links = copy.deepcopy(beacon)
    jobs = [dict(propriedade_id=P,transmissor_id=T,evento_id=f'incomplete-{i}') for i in range(incomplete)]
    detections = [{**rows[0],'evento_id':j['evento_id']} for j in jobs]
    jobs.append(dict(propriedade_id=P,transmissor_id=T,evento_id=rows[0]['evento_id']))
    tables = {'argos_iot_jobs':jobs,'deteccoes':detections+rows,
              'argos_posicoes_receptores':coordinates,'vinculos':links,
              'dispositivos':[dict(id=c['receptor_id'],codigo=f'RX-{i}',propriedade_id=P) for i,c in enumerate(coordinates)]}
    db = Mock(property_id=P)
    db.rows.side_effect=lambda table,**params:tables[table]
    return db,tables


def test_complete_event_beyond_first_fifty(beacon,caplog):
    db,tables=repository(beacon,incomplete=60)
    before=copy.deepcopy(tables)
    with caplog.at_level(logging.INFO): reports,summary=diagnose(db)
    assert summary['jobs_examinados']==61 and summary['eventos_selecionados']==1
    assert summary['resultados']['abaixo_do_minimo_calibrado']==60
    result=reports[0]
    assert result['posicao']['x_m']==pytest.approx(30,abs=.001)
    assert result['posicao']['y_m']==pytest.approx(40,abs=.001)
    assert result['posicao']['erro_residual_m']<.001
    assert len(result['receptores'])==3 and result['receptores'][0]['rssi_dbm']<0
    assert 'beacon-1' in caplog.text and 'diagnostico_resumo' in caplog.text
    db.upsert.assert_not_called(); db.finish_job.assert_not_called()
    assert tables==before
    assert diagnose(db)[1]==summary
    params=db.rows.call_args_list[0].kwargs
    assert params['estado']=='eq.pendente' and 'limit' not in params
    assert params['disponivel_em'].startswith('lte.')


def test_distinct_and_same_property_calibration(beacon):
    db,tables=repository(beacon)
    tables['argos_posicoes_receptores'][2]['propriedade_id']='other'
    tables['deteccoes'].append(tables['deteccoes'][0].copy())
    tables['deteccoes'].append({**tables['deteccoes'][2],'propriedade_id':'other'})
    assert diagnose(db)[1]['eventos_selecionados']==0


@pytest.mark.parametrize('failure',['duplicate','geometry','time','rssi'])
def test_same_localization_rejections(beacon,failure):
    db,tables=repository(beacon)
    if failure=='duplicate':tables['deteccoes'].append(tables['deteccoes'][0].copy())
    if failure=='geometry':
        for c in tables['argos_posicoes_receptores']: c['y_m']=0
    if failure=='time':tables['deteccoes'][0]['detectado_em']='2026-11-21T12:01:00Z'
    if failure=='rssi':tables['deteccoes'][0]['rssi_dbm']=1
    result=diagnose(db)[0][0]
    assert result['posicao'] is None
    assert result['motivo_rejeicao']=={'duplicate':'receptor_duplicado','geometry':'geometria_degenerada',
        'time':'horarios_incompativeis','rssi':'rssi_ou_calibracao_invalida'}[failure]
    db.upsert.assert_not_called();db.finish_job.assert_not_called()


def test_threshold_and_property_jobs(beacon):
    db,tables=repository(beacon)
    assert diagnose(db,4)[1]['eventos_selecionados']==0
    tables['argos_iot_jobs'][0]['propriedade_id']='other'
    assert diagnose(db)[1]['jobs_examinados']==0


def test_missing_timestamp_is_numeric_only(beacon):
    db,tables=repository(beacon)
    tables['deteccoes'][0]['detectado_em']=None
    report=diagnose(db)[0][0]
    assert report['posicao']['observado_em'] is None
    assert report['posicao']['animal_id'] is None
    assert 'sem_horario_observado_para_serie_temporal' in report['avisos']


@pytest.mark.parametrize('once,minimum,write',[(False,3,'0'),(True,2,'0'),(True,3,'1')])
def test_diagnostic_guard_before_connection(monkeypatch,once,minimum,write):
    monkeypatch.setenv('ARGOS_WRITE_ENABLED',write)
    factory=Mock();monkeypatch.setattr(Database,'environment',factory)
    with pytest.raises(ValueError):run(once,minimum)
    factory.assert_not_called()


def test_run_diagnostic_never_loads_model_or_outbox(beacon,monkeypatch):
    db,_=repository(beacon)
    monkeypatch.setenv('ARGOS_WRITE_ENABLED','0')
    monkeypatch.setattr(Database,'environment',lambda:db)
    model=Mock(side_effect=AssertionError('IA não deve ser carregada'))
    outbox=Mock(side_effect=AssertionError('Outbox não deve ser criada'))
    monkeypatch.setattr('argos_ml.worker.Predictor',model)
    monkeypatch.setattr('argos_ml.worker.Outbox',outbox)
    assert run(True,3)[1]['gravacoes']==0
    model.assert_not_called();outbox.assert_not_called()


def test_normal_queue_still_limits_fifty():
    db=Database('https://example.supabase.co','test',P)
    db.request=Mock(return_value=[])
    db.jobs('2026-11-22T00:00:00Z')
    assert db.request.call_args.args[2]['limit']==50
