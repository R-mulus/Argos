from unittest.mock import Mock
import requests
import pytest
from argos_ml.database import Database,DatabaseError
from argos_ml.worker import process_job,Outbox
from conftest import P


def response(rows):
    r=Mock(ok=True,content=b'json');r.json.return_value=rows
    return r


def test_pagination_and_scope():
    session=Mock();session.request.side_effect=[response([{'id':'1'}]),response([])]
    db=Database('https://example.supabase.co','not-a-secret',P,session)
    assert db.rows('deteccoes')==[{'id':'1'}]
    calls=session.request.call_args_list
    assert calls[1].kwargs['params']['offset']==1
    assert all(c.kwargs['params']['propriedade_id']=='eq.'+P for c in calls)
    with pytest.raises(ValueError): db.upsert('argos_localizacoes',{'propriedade_id':'other'},'id')


def test_network_failure_redacted():
    session=Mock();session.request.side_effect=requests.Timeout('secret')
    db=Database('https://example.supabase.co','not-a-secret',P,session)
    with pytest.raises(DatabaseError,match='^supabase_rede_indisponivel$'): db.rows('deteccoes')


def test_job_compare_and_set():
    session=Mock();session.request.return_value=response([])
    db=Database('https://example.supabase.co','key',P,session)
    db.finish_job(dict(transmissor_id='tx',evento_id='e',atualizado_em='before'),{'estado':'localizado'})
    assert session.request.call_args.kwargs['params']['atualizado_em']=='eq.before'


def test_worker_idempotent_and_dry_run(beacon):
    rows,coords,links=beacon
    saved={};acks=[]
    class Fake:
        property_id=P
        def rows(self,table,**kw):return {'deteccoes':rows,'argos_posicoes_receptores':coords,'vinculos':links}[table]
        def upsert(self,table,row,conflict):saved[(table,row['id'])]=row
        def finish_job(self,job,changes):acks.append(changes)
    job=dict(transmissor_id=rows[0]['transmissor_id'],evento_id='e')
    assert process_job(Fake(),job)=='localizavel_sem_gravar'
    assert not saved and not acks
    for _ in range(2):assert process_job(Fake(),job,True)=='localizado'
    assert len(saved)==1 and len(acks)==2


def test_write_failure_does_not_ack(beacon):
    db=Mock(property_id=P)
    db.rows.side_effect=list(beacon)
    db.upsert.side_effect=DatabaseError('offline')
    with pytest.raises(DatabaseError):process_job(db,dict(transmissor_id='tx',evento_id='e'),True)
    db.finish_job.assert_not_called()


def test_outbox_survives_restart(tmp_path):
    path=tmp_path/'state.sqlite'
    box=Outbox(path);box.add(dict(id='one',propriedade_id=P))
    db=Mock(property_id=P);db.upsert.side_effect=DatabaseError('offline')
    with pytest.raises(DatabaseError):box.flush(db)
    box.conn.close()
    resumed=Outbox(path);db.upsert.side_effect=None
    resumed.flush(db)
    assert resumed.conn.execute('select count(*) from predictions').fetchone()[0]==0
