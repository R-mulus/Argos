from datetime import datetime, timezone, timedelta
from pathlib import Path
import math
import numpy as np
import pytest
from argos_iot.eventos import localizar
from argos_iot.localizacao import distancia_rssi
from argos_iot.ml import ModeloGRU, geometria_compativel
from argos_iot.train import carregar_geometria, dataset

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
def readings(count=4):
    positions = [(0, 0), (100, 0), (0, 100), (100, 100)]
    return [dict(propriedade_id='p', transmissor_id='t', evento_id='e', receptor_id=str(i),
        animal_id='a', detectado_em=NOW, x_m=x, y_m=y, rssi_1m_dbm=-50, expoente_perda=2,
        rssi_dbm=-50 - 20 * math.log10(math.hypot(x-30,y-40))) for i,(x,y) in enumerate(positions[:count])]

def test_localizacao_e_receptores_extras():
    for count in (3,4):
        p,state=localizar(readings(count))
        assert state=='localizado'
        assert p['x_m']==pytest.approx(30,abs=.1)
        assert p['y_m']==pytest.approx(40,abs=.1)
        assert p['erro_residual_m']<.1
        assert p['receptores_utilizados']==count

def test_eventos_incompletos_duplicados_geometria_e_relogio():
    assert localizar(readings(2))[1]=='receptores_insuficientes'
    rows=readings(); rows[0]['evento_id']='outro'
    with pytest.raises(ValueError): localizar(rows)
    rows=readings(); rows[0]['receptor_id']=rows[1]['receptor_id']
    with pytest.raises(ValueError): localizar(rows)
    rows=readings(); rows[0]['detectado_em']=None
    assert localizar(rows)[1]=='sem_horario'
    rows=readings(); rows[0]['detectado_em']+=timedelta(seconds=3)
    assert localizar(rows)[1]=='horarios_incompativeis'
    rows=readings(); rows[0]['animal_id']='outro'
    assert localizar(rows)[1]=='vinculo_incompativel'
    rows=readings()
    for r in rows: r['y_m']=0
    assert localizar(rows)[1]=='geometria_invalida'

@pytest.mark.parametrize('values', [(float('nan'),-50,2),(-50,float('inf'),2),(-50,-50,0)])
def test_calibracao_invalida(values):
    with pytest.raises(ValueError): distancia_rssi(*values)

def test_sem_modelo_nao_fabrica_predicao():
    model=ModeloGRU(None)
    assert model.predict([], 'p') is None

def test_inferencia_rejeita_lacunas_propriedade_e_receptores():
    model=ModeloGRU(None)
    model.meta=dict(property_id='p',steps=2,interval_s=30,receivers=['1','2','3'],
        feature_mean=[0]*5,feature_std=[1]*5,xy_mean=[0]*2,xy_std=[1]*2,labels=['parado'],version='test')
    model.model=lambda x,training: {'current_xy':np.array([[1.,2.]]),
        'next_xy':np.array([[2.,3.]]),'behavior':np.array([[1.]])}
    history=[dict(observado_em=NOW+timedelta(seconds=i*30),x_m=1,y_m=2,rssi={'1':-50,'2':-60,'3':-70}) for i in range(2)]
    assert model.predict(history,'p')['proximo_x_m']==2
    assert model.predict(history,'outra') is None
    history[-1]['observado_em']+=timedelta(seconds=120)
    assert model.predict(history,'p') is None

GEOMETRIA = {rx: dict(x_m=x, y_m=y, rssi_1m_dbm=-50, expoente_perda=2.6)
             for rx, (x, y) in {'1': (0, 0), '2': (120, 0), '3': (60, 100)}.items()}

def test_geometria_divergente_bloqueia_predicao():
    model=ModeloGRU(None)
    model.meta=dict(property_id='p',steps=2,interval_s=30,receivers=['1','2','3'],geometria=GEOMETRIA,
        feature_mean=[0]*5,feature_std=[1]*5,xy_mean=[0]*2,xy_std=[1]*2,labels=['parado'],version='test')
    model.model=lambda x,training: {'current_xy':np.array([[1.,2.]]),
        'next_xy':np.array([[2.,3.]]),'behavior':np.array([[1.]])}
    history=[dict(observado_em=NOW+timedelta(seconds=i*30),x_m=1,y_m=2,rssi={'1':-50,'2':-60,'3':-70}) for i in range(2)]
    atual={rx: dict(g) for rx,g in GEOMETRIA.items()}
    assert model.predict(history,'p',atual) is not None
    assert model.predict(history,'p') is None
    atual['2']['x_m']=125
    assert model.predict(history,'p',atual) is None
    atual['2']['x_m']=120.3
    assert geometria_compativel(GEOMETRIA,atual)
    atual['3']['expoente_perda']=3.0
    assert not geometria_compativel(GEOMETRIA,atual)
    del atual['1']
    assert not geometria_compativel(GEOMETRIA,atual)

def test_modelo_sem_geometria_nao_carrega(tmp_path):
    (tmp_path/'metadata.json').write_text('{"schema_version": 2, "aprovado": true}')
    model=ModeloGRU(tmp_path)
    assert model.status=='sem_geometria' and model.model is None

def test_treino_le_geometria_da_api(tmp_path):
    path=tmp_path/'geo.json'
    path.write_text('{"data":[' + ','.join(
        f'{{"receptor_id":"{rx}","x_m":{g["x_m"]},"y_m":{g["y_m"]},"rssi_1m_dbm":-50,"expoente_perda":2.6}}'
        for rx,g in GEOMETRIA.items()) + ']}')
    assert carregar_geometria(path,['1','2','3'])==GEOMETRIA
    with pytest.raises(ValueError): carregar_geometria(path,['1','2','4'])

def test_treino_sem_vazamento_entre_cortes(tmp_path):
    path=tmp_path/'dados.csv'
    header='propriedade_id,animal_id,timestamp,rssi_1,rssi_2,rssi_3,rssi_x_m,rssi_y_m,referencia_x_m,referencia_y_m,comportamento,fonte_referencia\n'
    rows=[f'p,a,{(NOW+timedelta(seconds=i*30)).isoformat()},-50,-60,-70,{i},1,{i},2,parado,levantamento\n' for i in range(200)]
    path.write_text(header+''.join(rows))
    split=dataset(path,['1','2','3'],8,30,'p')
    ranges=[(min(r[0][0,-2] for r in s),max(r[2][0] for r in s)) for s in split]
    assert ranges[0][1]<ranges[1][0] and ranges[1][1]<ranges[2][0]
    with pytest.raises(ValueError): dataset(path,['1','2','3'],8,30,'outra')

def test_copias_protocolo_iguais():
    root=Path(__file__).resolve().parents[2]
    assert (root/'firmware/ArgosTransmissor/ArgosProtocol.h').read_bytes()==(root/'firmware/ArgosReceptor/ArgosProtocol.h').read_bytes()
