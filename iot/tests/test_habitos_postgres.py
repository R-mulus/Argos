"""Integração somente em PostgreSQL descartável, com migrações aplicadas."""
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import psycopg
from psycopg.rows import dict_row
import pytest
import numpy as np
from psycopg.types.json import Jsonb
from argos_iot.habitos import ModeloHabitos
from argos_iot.habitos_worker import consolidate, cycle


@pytest.mark.skipif(not os.getenv('ARGOS_TEST_DATABASE_URL'), reason='PostgreSQL de teste não configurado')
def test_consolidacao_reconcilia_e_isola():
    with psycopg.connect(os.environ['ARGOS_TEST_DATABASE_URL'], row_factory=dict_row) as c:
        user, other, prop, animal, tx, link = [uuid4() for _ in range(6)]
        c.execute('INSERT INTO auth.users(id) VALUES (%s),(%s)', (user, other))
        c.execute("INSERT INTO propriedades(id,usuario_id,nome) VALUES (%s,%s,'Hábitos')", (prop,user))
        c.execute("INSERT INTO animais(id,propriedade_id,identificacao) VALUES (%s,%s,'A')", (animal,prop))
        c.execute("INSERT INTO dispositivos(id,propriedade_id,codigo,tipo) VALUES (%s,%s,'TX','transmissor')", (tx,prop))
        c.execute("INSERT INTO vinculos(id,propriedade_id,animal_id,transmissor_id,inicio_em) VALUES (%s,%s,%s,%s,'2020-01-01')", (link,prop,animal,tx))
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        zones = []
        for i in range(2):
            rx, zone = uuid4(), uuid4()
            zones.append(str(zone))
            c.execute("INSERT INTO dispositivos(id,propriedade_id,codigo,tipo) VALUES (%s,%s,%s,'receptor')", (rx,prop,f'RX{i}'))
            c.execute("INSERT INTO zonas(id,propriedade_id,nome,receptor_id,ativa) VALUES (%s,%s,%s,%s,true)", (zone,prop,f'Z{i}',rx))
            for j in range(3):
                c.execute('INSERT INTO deteccoes(propriedade_id,transmissor_id,receptor_id,evento_id,rssi_dbm,vinculo_id,zona_id,detectado_em) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
                          (prop,tx,rx,f'evento{j}',-60+i*10,link,zone,start+timedelta(minutes=j*5)))
        assert consolidate(c, prop, start, start+timedelta(days=1)) == 1
        assert consolidate(c, prop, start, start+timedelta(days=1)) == 1
        row = c.execute('SELECT * FROM argos_habitos_diarios WHERE propriedade_id=%s', (prop,)).fetchone()
        assert row['contagens'] == {zones[1]: 3}
        today = datetime.now(timezone.utc).date()
        for i in range(30):
            c.execute('INSERT INTO argos_habitos_diarios(propriedade_id,animal_id,dia,contagens) VALUES (%s,%s,%s,%s)',
                      (prop,animal,today-timedelta(days=i+1),Jsonb({zones[0]: 288})))
        model = ModeloHabitos(None)
        model.meta = dict(property_id=str(prop),zones=sorted(zones),version='teste')
        model.model = lambda x, training: np.tile([.6, .4], (1,30,1))
        assert cycle(c, prop, model) == 1
        assert cycle(c, prop, model) == 1
        predictions = c.execute('SELECT * FROM argos_previsoes_habitos WHERE propriedade_id=%s', (prop,)).fetchall()
        assert len(predictions) == 1 and len(predictions[0]['previsoes']) == 30
        with c.transaction():
            c.execute('SET LOCAL ROLE authenticated')
            c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)", (str(other),))
            assert c.execute('SELECT * FROM argos_habitos_diarios WHERE propriedade_id=%s', (prop,)).fetchall() == []
            assert c.execute('SELECT * FROM argos_previsoes_habitos WHERE propriedade_id=%s', (prop,)).fetchall() == []
            c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)", (str(user),))
            assert len(c.execute('SELECT * FROM argos_habitos_diarios WHERE propriedade_id=%s', (prop,)).fetchall()) == 31
            assert len(c.execute('SELECT * FROM argos_previsoes_habitos WHERE propriedade_id=%s', (prop,)).fetchall()) == 1
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                c.execute('SET LOCAL ROLE authenticated')
                c.execute('DELETE FROM argos_habitos_diarios')
        c.rollback()
