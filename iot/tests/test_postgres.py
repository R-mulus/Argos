"""Execute somente contra PostgreSQL descartável com migrações aplicadas."""
import os
import math
from datetime import datetime, timezone
from uuid import uuid4
import psycopg
from psycopg.rows import dict_row
import pytest
from argos_iot.worker import process_one
from argos_iot.ml import ModeloGRU

@pytest.mark.skipif(not os.getenv('ARGOS_TEST_DATABASE_URL'), reason='PostgreSQL de teste não configurado')
def test_jobs_replay_receptores_adicionais_e_rls():
    with psycopg.connect(os.environ['ARGOS_TEST_DATABASE_URL'], row_factory=dict_row, autocommit=True) as c:
        user, other, prop, animal, tx, link = [uuid4() for _ in range(6)]
        rx = [uuid4() for _ in range(4)]
        c.execute('INSERT INTO auth.users(id) VALUES (%s),(%s)', (user,other))
        c.execute('INSERT INTO public.propriedades(id,usuario_id,nome) VALUES (%s,%s,%s)',(prop,user,'Teste isolado'))
        c.execute('INSERT INTO public.animais(id,propriedade_id,identificacao) VALUES (%s,%s,%s)',(animal,prop,'A-teste'))
        c.execute("INSERT INTO public.dispositivos(id,propriedade_id,codigo,tipo) VALUES (%s,%s,'TX','transmissor')",(tx,prop))
        c.execute("INSERT INTO public.vinculos(id,propriedade_id,animal_id,transmissor_id,inicio_em) VALUES (%s,%s,%s,%s,'2020-01-01')",(link,prop,animal,tx))
        for i,(x,y) in enumerate([(0,0),(100,0),(0,100),(100,100)]):
            c.execute("INSERT INTO public.dispositivos(id,propriedade_id,codigo,tipo) VALUES (%s,%s,%s,'receptor')",(rx[i],prop,f'RX-{i}'))
            c.execute('INSERT INTO public.argos_posicoes_receptores VALUES (%s,%s,%s,%s,-50,2,now())',(rx[i],prop,x,y))
        def insert(i):
            x,y=[(0,0),(100,0),(0,100),(100,100)][i]
            args=(prop,tx,rx[i],str(tx)+':boot:1',round(-50-20*math.log10(math.hypot(x-30,y-40))),link,now)
            c.execute('INSERT INTO public.deteccoes(propriedade_id,transmissor_id,receptor_id,evento_id,rssi_dbm,vinculo_id,detectado_em) VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(receptor_id,evento_id) DO NOTHING',args)
        def run():
            c.execute("UPDATE public.argos_iot_jobs SET disponivel_em=now() WHERE propriedade_id=%s",(prop,))
            assert process_one(c,ModeloGRU(None))
        now=datetime.now(timezone.utc)
        insert(0);insert(1);run()
        assert c.execute('SELECT count(*) n FROM public.argos_localizacoes WHERE propriedade_id=%s',(prop,)).fetchone()['n']==0
        insert(2);run()
        loc=c.execute('SELECT * FROM public.argos_localizacoes WHERE propriedade_id=%s',(prop,)).fetchone()
        assert loc['receptores_utilizados']==3
        assert math.hypot(loc['x_m']-30,loc['y_m']-40)<10
        insert(2)
        assert not process_one(c,ModeloGRU(None))
        insert(3);run()
        rows=c.execute('SELECT * FROM public.argos_localizacoes WHERE propriedade_id=%s',(prop,)).fetchall()
        assert len(rows)==1 and rows[0]['id']==loc['id'] and rows[0]['receptores_utilizados']==4
        with c.transaction():
            c.execute('SET LOCAL ROLE authenticated')
            c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(str(other),))
            assert c.execute('SELECT * FROM public.argos_localizacoes WHERE propriedade_id=%s',(prop,)).fetchall()==[]
            assert c.execute('SELECT * FROM public.argos_posicoes_receptores WHERE propriedade_id=%s',(prop,)).fetchall()==[]
            c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(str(user),))
            assert len(c.execute('SELECT * FROM public.argos_localizacoes WHERE propriedade_id=%s',(prop,)).fetchall())==1
        with pytest.raises(psycopg.errors.RaiseException):
            c.execute('UPDATE public.argos_posicoes_receptores SET expoente_perda=0 WHERE receptor_id=%s',(rx[0],))
