import math
import pytest
from datetime import datetime,timezone,timedelta

P='11111111-1111-4111-8111-111111111111'
A='22222222-2222-4222-8222-222222222222'
T='33333333-3333-4333-8333-333333333333'


@pytest.fixture
def beacon():
    coordinates=[]; rows=[]
    for i,(x,y) in enumerate([(0,0),(100,0),(0,100)]):
        rx=f'rx-{i}'
        coordinates.append(dict(receptor_id=rx,propriedade_id=P,x_m=x,y_m=y,rssi_1m_dbm=-40,expoente_perda=2))
        rssi=-40-20*math.log10(math.hypot(30-x,40-y))
        rows.append(dict(id=str(i),propriedade_id=P,transmissor_id=T,evento_id='beacon-1',
            receptor_id=rx,rssi_dbm=rssi,detectado_em='2026-11-21T12:00:00+00:00',vinculo_id='v1'))
    links=[dict(id='v1',propriedade_id=P,transmissor_id=T,animal_id=A,
                inicio_em='2026-11-20T00:00:00+00:00',fim_em=None)]
    return rows,coordinates,links


def history(n=600,step=60):
    start=datetime(2026,1,1,tzinfo=timezone.utc)
    return [dict(id=str(i),propriedade_id=P,animal_id=A,transmissor_id=T,evento_id=f'e-{i}',
        observado_em=(start+timedelta(seconds=i*step)).isoformat(),
        x_m=10+5*math.sin(i/15),y_m=10+5*math.cos(i/15),erro_residual_m=0.1,receptores_utilizados=3)
        for i in range(n)]
