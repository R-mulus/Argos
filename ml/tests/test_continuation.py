import copy
import json
from unittest.mock import Mock
import pytest
from argos_ml.datasets import seal_dataset, verify_dataset
from argos_ml.worker import process_job, Outbox
from conftest import history, P


def test_export_experiment_is_local_and_unreviewed(monkeypatch,tmp_path):
    from argos_ml.cli import main
    refrows=[dict(receptor_id=str(i),propriedade_id=P,x_m=x,y_m=y,rssi_1m_dbm=-40,expoente_perda=2)
             for i,(x,y) in enumerate([(0,0),(10,0),(0,10)])]
    db=Mock(property_id=P);db.rows.return_value=refrows
    monkeypatch.setattr('argos_ml.cli.Database.environment',lambda:db)
    reports=[dict(posicao=r,propriedade_id=P,transmissor_id=r['transmissor_id'],evento_id=r['evento_id']) for r in history(10)]
    monkeypatch.setattr('argos_ml.diagnostics.diagnose',lambda *a:(reports,{}))
    output=tmp_path/'dataset.json'
    monkeypatch.setattr('sys.argv',['cli','--env',str(tmp_path/'absent.env'),'export-experiment','--out',str(output)])
    main()
    dataset=json.loads(output.read_text());verify_dataset(dataset)
    assert dataset['source']=='experimental' and not dataset['reference']['validated']
    db.upsert.assert_not_called();db.finish_job.assert_not_called()
    with pytest.raises(ValueError,match='dataset_ja_existe'):main()


def test_real_dataset_requires_per_row_reference_and_review():
    ref=dict(property_id=P,version='test-only',calibration_sha256='a'*64,validated=True)
    rows=history(10)
    with pytest.raises(ValueError):seal_dataset(rows,[],'real',ref)
    rows=[{**r,'referencial_versao':ref['version'],'calibracao_sha256':'a'*64,'origem':'real'} for r in rows]
    dataset=seal_dataset(rows,[],'real',ref)
    verify_dataset(dataset)
    wrong=copy.deepcopy(rows);wrong[-1]['referencial_versao']='different'
    with pytest.raises(ValueError):seal_dataset(wrong,[],'real',ref)
    with pytest.raises(ValueError):seal_dataset(rows,[],'real',{**ref,'calibration_sha256':'bad'})


def test_inference_failure_preserves_location_and_other_model(beacon,monkeypatch,tmp_path):
    rows,coords,links=beacon
    ref=dict(version='test-only',calibration_sha256='a'*64,validated=True)
    monkeypatch.setattr('argos_ml.worker.operational_reference',lambda *a:ref)
    db=Mock(property_id=P)
    db.rows.side_effect=lambda table,**kw: {'deteccoes':rows,'argos_posicoes_receptores':coords,'vinculos':links,'argos_localizacoes':history(10)}[table]
    broken=Mock();broken.cfg.steps=4;broken.cfg.interval_s=60;broken.predict.side_effect=RuntimeError('tensorflow offline')
    position=Mock();position.cfg.steps=4;position.cfg.interval_s=60
    position.predict.return_value=dict(id='test',propriedade_id=P,comportamento=None,confianca=None,probabilidades=None)
    box=Outbox(tmp_path/'outbox.sqlite')
    try:
        assert process_job(db,dict(transmissor_id=rows[0]['transmissor_id'],evento_id='e'),True,[broken,position],box)=='localizado'
        assert db.upsert.call_args.args[1]['referencial_versao']=='test-only'
        assert box.depth()==1
        db.finish_job.assert_called_once()
        box.flush(db)
        assert box.depth()==0
    finally:box.conn.close()
