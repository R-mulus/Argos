import numpy as np
import pytest
from argos_ml.demo_v2 import load_dataset,windows,DATA,metrics


def test_dataset_physical_integrity_and_split():
    if not DATA.exists():
        pytest.skip('Gere o dataset com python -m argos_ml.cli demo-v2 generate')
    d=load_dataset(DATA)
    assert len(d['rows'])==60000
    assert all(r['origem']=='synthetic' for r in d['rows'])
    for r in d['rows']:
        assert -10<=r['referencia_x_m']<=10 and -7<=r['referencia_y_m']<=11
    for a,b in zip(d['rows'],d['rows'][1:]):
        if a['sessao']==b['sessao']:
            assert np.hypot(b['referencia_x_m']-a['referencia_x_m'],b['referencia_y_m']-a['referencia_y_m'])<=2.11
    splits,ids=windows(d)
    assert not set(ids[0])&set(ids[1]) and not set(ids[0])&set(ids[2]) and not set(ids[1])&set(ids[2])
    assert all(len(s[0])>100 for s in splits)
    assert any(r['x_m'] is None for r in d['rows'])


def test_metrics_known_error():
    m=metrics(np.array([[0,0],[1,1]]),np.array([[3,4],[4,5]]))
    assert m['erro_euclidiano_medio_m']==5 and m['erro_p95_m']==5


def test_worker_does_not_reinterpret_old_geometry(beacon):
    from argos_ml.worker import process_job
    rows,coordinates,links=beacon
    coordinates=[{**c,'atualizado_em':'2026-11-25T00:00:00+00:00'} for c in coordinates]
    class DB:
        def rows(self,*args,**kwargs):return rows
        def finish_job(self,job,changes):self.changes=changes
    db=DB()
    status=process_job(db,dict(transmissor_id=rows[0]['transmissor_id'],evento_id=rows[0]['evento_id']),
                       write=True,coordinates=coordinates,links=links)
    assert status=='referencial_posterior_a_medicao'
    assert db.changes['estado']==status


def test_main_cli_routes_demo_v2(monkeypatch):
    from argos_ml import cli, demo_v2
    captured=[]
    monkeypatch.setattr(demo_v2,'run',lambda args:captured.append(args))
    monkeypatch.setattr(cli,'load_dotenv',lambda _:None)
    monkeypatch.setattr('sys.argv',['argos_ml.cli','demo-v2','infer'])
    cli.main()
    assert captured[0].demo_command=='infer'
    assert captured[0].model==demo_v2.ROOT/'ml/model/artifacts/posicao-demo-v2'
