import pytest
from unittest.mock import Mock
from argos_ml.provenance import calibration_hash, operational_reference, worker_lock
from argos_ml.worker import Outbox
from argos_ml.database import DatabaseError
from conftest import P


def test_experimental_never_operational(beacon,monkeypatch):
    monkeypatch.setenv('ARGOS_DATA_ORIGIN','experimental')
    monkeypatch.setenv('ARGOS_WRITE_ENABLED','1')
    with pytest.raises(ValueError):operational_reference(beacon[1],P)


def test_calibration_change_revokes_validation(beacon,monkeypatch):
    coords=beacon[1]
    for key,value in dict(ARGOS_DATA_ORIGIN='real',ARGOS_CALIBRATION_VALIDATED='1',
        ARGOS_REFERENCE_VERSION='field-v1',ARGOS_CALIBRATION_SHA256=calibration_hash(coords,P)).items():
        monkeypatch.setenv(key,value)
    assert operational_reference(coords,P)['validated']
    assert calibration_hash(coords,P)==calibration_hash(list(reversed(coords)),P)
    coords[0]['x_m']+=1
    with pytest.raises(ValueError):operational_reference(coords,P)


def test_single_worker_and_release(tmp_path,monkeypatch):
    monkeypatch.setenv('ARGOS_LOCK_DIR',str(tmp_path))
    with worker_lock(P):
        with pytest.raises(RuntimeError):
            with worker_lock(P):pass
    with worker_lock(P):pass


def test_outbox_failure_does_not_starve_next_animal(tmp_path):
    box=Outbox(tmp_path/'queue.sqlite')
    box.add(dict(id='a',propriedade_id=P));box.add(dict(id='b',propriedade_id=P))
    db=Mock(property_id=P);db.upsert.side_effect=[DatabaseError('http'),None]
    with pytest.raises(DatabaseError):box.flush(db)
    assert box.depth()==1 and db.upsert.call_count==2
