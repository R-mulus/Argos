from datetime import date, timedelta
import numpy as np
import pytest
from argos_iot.habitos import ModeloHabitos, partitions, series


def rows(n=400):
    return [dict(animal_id='a', dia=date(2025, 1, 1)+timedelta(days=i),
                 contagens={'z1': 144+i % 100, 'z2': 100-i % 100}) for i in range(n)]


def test_cobertura_duplicatas_e_zonas():
    data = rows(2)
    data[0]['contagens'] = {'z1': 10}
    assert series(data, ['z1', 'z2'])['a'][data[0]['dia']] is None
    with pytest.raises(ValueError): series(rows(2), ['z1'])
    with pytest.raises(ValueError): series(rows(2)*2, ['z1', 'z2'])
    data[0]['contagens'] = {'z1': 289}
    with pytest.raises(ValueError): series(data, ['z1', 'z2'])


def test_cortes_sem_sobreposicao_ou_lacunas():
    data = rows()
    groups = series(data, ['z1', 'z2'])
    a, b, c = partitions(groups)
    # 240/80/80 dias: cada janela consome 60 dias inteiramente dentro da partição.
    assert [len(s[0]) for s in (a, b, c)] == [181, 21, 21]
    assert a[0].shape == (181, 30, 4)
    assert a[1].shape == (181, 30, 2)
    del groups['a'][data[10]['dia']]
    assert len(partitions(groups)[0][0]) < len(a[0])
    with pytest.raises(ValueError): partitions(series(rows(90), ['z1', 'z2']))


def test_previsao_30_dias_sem_fabricar_dados():
    model = ModeloHabitos(None)
    assert model.predict([], 'p') == []
    model.meta = dict(property_id='p', zones=['z1', 'z2'], version='teste')
    model.model = lambda x, training: np.tile([.6, .4], (1, 30, 1))
    data = rows(30)
    today = data[-1]['dia']+timedelta(days=1)
    result = model.predict(data, 'p', today)
    assert len(result[0]['previsoes']) == 30
    assert result[0]['previsoes'][0]['dia'] == today.isoformat()
    assert result[0]['previsoes'][-1]['dia'] == (today+timedelta(days=29)).isoformat()
    assert model.predict(data, 'outra', today) == []
    assert model.predict(data[:-1], 'p', today) == []
    assert model.predict(data, 'p', today+timedelta(days=1)) == []
    model.model = lambda x, training: np.zeros((1, 30, 2))
    with pytest.raises(ValueError): model.predict(data, 'p', today)
