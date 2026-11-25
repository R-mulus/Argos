"""Regressões do monitor independente: sem credenciais e sem gravar telemetria."""
import importlib.util
import threading
import time
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('monitor',Path(__file__).with_name('servidor.py'))
m=importlib.util.module_from_spec(spec)
with patch.dict(os.environ):
    spec.loader.exec_module(m)


def point(event='a', seconds=-10, x=1):
    return dict(evento_id=event,observado_em=(datetime.now(timezone.utc)+timedelta(seconds=seconds)).isoformat(),
                calculado_em=datetime.now(timezone.utc).isoformat(),x_m=x,y_m=1,
                receptores_utilizados=3,erro_residual_m=.5)


def snapshot(p):
    return dict(posicao=p,trilha=[p],rejeitados=[],transmissor={'id':'tx'},evento_rssi=p['evento_id'])


def test_order_null_duplicate_jump():
    a=point();b=point('b',-4);bad=point('jump',-2,500)
    rows,rejected=m.valid_positions([b,{**a,'observado_em':None},a,a,bad])
    assert [r['evento_id'] for r in rows]==['a','b']
    assert len(rejected)==3


def test_new_event_same_coordinates_and_no_regression():
    store=m.LiveStore();store.started=time.monotonic()
    with patch.object(m,'build_snapshot',return_value=snapshot(point())): store._refresh()
    newer=point('b',-2)
    with patch.object(m,'build_snapshot',return_value=snapshot(newer)): store._refresh()
    assert store.snapshot['posicao']['evento_id']=='b'
    with patch.object(m,'build_snapshot',return_value=snapshot(point('old',-60))):store._refresh()
    assert store.snapshot['posicao']['evento_id']=='b'


def test_failure_preserves_and_recovers():
    store=m.LiveStore();store.started=time.monotonic()
    with patch.object(m,'build_snapshot',return_value=snapshot(point())):store._refresh()
    with patch.object(m,'build_snapshot',side_effect=RuntimeError('rede')):store._refresh()
    assert store.snapshot and store.error=='rede' and not store.refreshing
    with patch.object(m,'build_snapshot',return_value=snapshot(point('b',-1))):store._refresh()
    assert store.error is None and store.snapshot['posicao']['evento_id']=='b'


def test_single_inflight():
    store=m.LiveStore();gate=threading.Event();calls=[]
    def slow(_):
        calls.append(1);gate.wait(2);return snapshot(point())
    with patch.object(m,'build_snapshot',side_effect=slow):
        for _ in range(20):store.trigger()
        time.sleep(.05);gate.set()
        deadline=time.monotonic()+2
        while store.refreshing and time.monotonic()<deadline:time.sleep(.01)
    assert len(calls)==1


def test_clock_advances_for_cached_snapshot():
    store=m.LiveStore();store.config_error='não consultar';store.snapshot=snapshot(point())
    _,a=store.payload();time.sleep(.01);_,b=store.payload()
    assert m.stamp(b['server_time'])>m.stamp(a['server_time'])


def test_jump_requires_next_confirmation():
    points,_=m.valid_positions([point('a',-20),point('jump',-10,200),point('confirm',-5,202)])
    assert [p['evento_id'] for p in points]==['a','jump','confirm']
