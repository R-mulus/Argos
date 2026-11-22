import copy
import numpy as np
import pytest
from argos_ml.localization import localize,distance_rssi,InvalidEvent


def test_known_position_and_idempotency(beacon):
    first=localize(*beacon); second=localize(list(reversed(beacon[0])),*beacon[1:])
    assert np.allclose([first['x_m'],first['y_m']],[30,40],atol=.001)
    assert first['id']==second['id']
    assert first['erro_residual_m']<.001 and first['receptores_utilizados']==3
    assert first['animal_id']==beacon[2][0]['animal_id']


@pytest.mark.parametrize('rssi,reference,exponent',[(1,-40,2),(-128,-40,2),(float('nan'),-40,2),(-60,-40,0),(-60,-40,float('inf'))])
def test_invalid_rssi(rssi,reference,exponent):
    with pytest.raises(InvalidEvent): distance_rssi(rssi,reference,exponent)


def test_missing_duplicate_and_mixed(beacon):
    rows,coords,links=beacon
    for modified in [rows[:2],rows+[rows[0]], [{**rows[0],'propriedade_id':'other'}]+rows[1:],
                     [{**rows[0],'transmissor_id':'other'}]+rows[1:]]:
        with pytest.raises(InvalidEvent): localize(modified,coords,links)


def test_collinear(beacon):
    rows,coords,links=beacon
    for i,c in enumerate(coords): c.update(x_m=i*50,y_m=0)
    with pytest.raises(InvalidEvent,match='geometria'): localize(rows,coords,links)


def test_noise(beacon):
    rows,coords,links=beacon
    for row,noise in zip(rows,[1,-1,.5]): row['rssi_dbm']+=noise
    result=localize(rows,coords,links)
    assert np.linalg.norm([result['x_m']-30,result['y_m']-40])<15
    assert result['erro_residual_m']>0


def test_historical_link_not_current(beacon):
    rows,coords,links=beacon
    old=copy.deepcopy(links[0]); old['fim_em']='2026-11-22T00:00:00Z'
    current={**old,'id':'v2','animal_id':'different','inicio_em':old['fim_em'],'fim_em':None}
    assert localize(rows,coords,[old,current])['animal_id']==old['animal_id']
    with pytest.raises(InvalidEvent,match='ambiguo'): localize(rows,coords,[old,links[0]])


def test_missing_time_does_not_reassign(beacon):
    rows,coords,links=beacon
    rows[0]['detectado_em']=None
    result=localize(rows,coords,links)
    assert result['observado_em'] is None and result['animal_id'] is None


def test_wrong_calibration_property(beacon):
    rows,coords,links=beacon; coords[0]['propriedade_id']='other'
    with pytest.raises(InvalidEvent): localize(rows,coords,links)
