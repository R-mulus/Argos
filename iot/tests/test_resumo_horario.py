"""Regressão SQL no banco descartável; não escreve no Supabase hospedado."""
import os
from uuid import uuid4
import psycopg
import pytest

@pytest.mark.skipif(not os.getenv('ARGOS_TEST_DATABASE_URL'), reason='PostgreSQL de teste não configurado')
def test_recebimento_nao_rejuvenesce_captura_ausente():
    with psycopg.connect(os.environ['ARGOS_TEST_DATABASE_URL']) as conn:
        user, prop, animal, tx, rx, link = [uuid4() for _ in range(6)]
        conn.execute('insert into auth.users(id) values (%s)',(user,))
        conn.execute('insert into public.propriedades(id,usuario_id,nome) values (%s,%s,%s)',(prop,user,'Teste horário'))
        conn.execute('insert into public.animais(id,propriedade_id,identificacao) values (%s,%s,%s)',(animal,prop,'A'))
        for ident, kind in [(tx,'transmissor'),(rx,'receptor')]:
            conn.execute('insert into public.dispositivos(id,propriedade_id,codigo,tipo) values (%s,%s,%s,%s)',(ident,prop,kind,kind))
        conn.execute("insert into public.vinculos(id,propriedade_id,animal_id,transmissor_id,inicio_em) values (%s,%s,%s,%s,'2020-01-01')",(link,prop,animal,tx))
        conn.execute("insert into public.deteccoes(propriedade_id,transmissor_id,receptor_id,vinculo_id,evento_id,rssi_dbm,detectado_em,recebido_no_gateway_em) values (%s,%s,%s,%s,'sem-hora',-50,null,now())",(prop,tx,rx,link))
        result=conn.execute('select public.resumo_monitoramento(%s)',(prop,)).fetchone()[0]
        assert result['recentes']==0 and result['sem_horario']==1
        assert result['animais'][0]['instante_posicao'] is None
        conn.rollback()
