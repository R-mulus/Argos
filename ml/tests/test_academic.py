import json
import os
from pathlib import Path
from unittest.mock import Mock
import pytest
from argos_ml.provenance import operational_reference, calibration_hash
from argos_ml.worker import process_job, Outbox
from argos_ml.datasets import seal_dataset
from argos_ml.training import train, approve_demo, approve
from argos_ml.inference import Predictor
from argos_ml.config import SeriesConfig
from argos_ml.model_registry import public_metadata
from argos_ml.monitoring import collection_report
from argos_ml.localization import timestamp
from conftest import P, history

def configure(monkeypatch,ref):
    for k,v in dict(ARGOS_EXECUTION_MODE='academic_demo',ARGOS_DEMO_AUTHORIZED='1',ARGOS_DATA_ORIGIN='experimental',
        ARGOS_REFERENCE_VERSION=ref['version'],ARGOS_CALIBRATION_SHA256=ref['calibration_sha256'],ARGOS_PROPERTY_ID=P).items():
        monkeypatch.setenv(k,v)

def test_academic_explicit_and_preserves_algorithm(beacon,monkeypatch):
    rows,coords,links=beacon
    ref=dict(version='curral-demo-v1',calibration_sha256=calibration_hash(coords,P))
    configure(monkeypatch,ref)
    monkeypatch.delenv('ARGOS_DEMO_AUTHORIZED')
    with pytest.raises(ValueError):operational_reference(coords,P)
    monkeypatch.setenv('ARGOS_DEMO_AUTHORIZED','1')
    assert operational_reference(coords,P)['validated'] is False
    db=Mock(property_id=P);db.rows.side_effect=[rows,coords,links]
    process_job(db,dict(transmissor_id=rows[0]['transmissor_id'],evento_id='beacon-1'),True)
    result=db.upsert.call_args.args[1]
    assert result['origem']=='experimental' and result['x_m']==pytest.approx(30)
    assert result['y_m']==pytest.approx(40) and result['animal_id']==links[0]['animal_id']
    coords[0]['x_m']+=1
    with pytest.raises(ValueError):operational_reference(coords,P)
    monkeypatch.setenv('ARGOS_EXECUTION_MODE','production')
    with pytest.raises(ValueError):operational_reference(coords,P)

def test_demo_train_approve_infer_outbox(tmp_path,monkeypatch):
    pytest.importorskip('tensorflow')
    ref=dict(property_id=P,version='fixture-demo',calibration_sha256='a'*64,validated=False)
    configure(monkeypatch,ref)
    rows=[{**r,'origem':'experimental','referencial_versao':ref['version'],'calibracao_sha256':ref['calibration_sha256']} for r in history(600)]
    dataset=seal_dataset(rows,[],'experimental',ref)
    path=tmp_path/'demo-position'
    m=train(dataset,path,SeriesConfig(steps=4,horizon_s=60),epochs=2)
    assert m['approval_status']=='evaluated_experimental' and Predictor(path).model is None
    with pytest.raises(ValueError):approve(path,'fixture-reviewer')
    m=approve_demo(path,'fixture-reviewer')
    assert not m['approved'] and not m['reference']['validated']
    predictor=Predictor(path)
    assert predictor.status=='disponivel'
    prediction=predictor.predict(rows[-10:],P,ref)
    assert prediction['origem']=='experimental' and prediction['comportamento'] is None
    assert public_metadata(m)['approval_status']=='demo_approved'
    if os.getenv('ARGOS_TEST_DEMO_EXPORT'):
        Path(os.environ['ARGOS_TEST_DEMO_EXPORT']).write_text(json.dumps({'prediction':prediction,'model':public_metadata(m),
            'baseline':m['baseline'],'improves_baseline':m['improves_baseline']}),encoding='utf-8')
    box=Outbox(tmp_path/'outbox.sqlite')
    db=Mock(property_id=P)
    try:
        box.add(prediction);box.add(prediction);assert box.depth()==1
        box.flush(db,'real');assert box.depth()==1;db.upsert.assert_not_called()
        box.flush(db,'experimental');assert box.depth()==0
    finally:box.conn.close()
    monkeypatch.setenv('ARGOS_EXECUTION_MODE','production')
    assert Predictor(path).model is None
    assert json.loads((path/'manifest.json').read_text())['approved'] is False

def test_collection_read_only_and_24h_windows():
    rows=[{**r,'origem':'experimental','referencial_versao':'v1','calibracao_sha256':'a'*64} for r in history(1440)]
    db=Mock()
    db.rows.side_effect=[[],[],rows]
    result=collection_report(db,timestamp('2026-01-01T00:00:00Z'),timestamp('2026-01-02T00:00:00Z'),SeriesConfig())
    windows=result['janelas_por_referencial'][0]
    assert [windows[k] for k in ('treino','validacao','teste')]==[829,253,253]
    db.upsert.assert_not_called();db.finish_job.assert_not_called()
