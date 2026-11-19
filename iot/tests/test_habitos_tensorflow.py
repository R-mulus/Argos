"""Smoke test sintético opcional: não comprova qualidade de previsões em campo."""
import json
from datetime import date, timedelta
import pytest
from argos_iot.habitos import train, ModeloHabitos


def test_treino_salvamento_e_inferencia(tmp_path):
    pytest.importorskip('tensorflow')
    rows = [dict(animal_id='a',dia=date(2025,1,1)+timedelta(days=i),
                 contagens={'z1': 180 if i % 7 < 5 else 60, 'z2': 60 if i % 7 < 5 else 180})
            for i in range(400)]
    meta = train(rows, ['z1','z2'], 'p', tmp_path, epochs=1)
    assert meta['aprovado'] is False
    assert len(meta['mae_por_horizonte']['gru']) == 30
    assert ModeloHabitos(tmp_path).predict(rows, 'p') == []
    # Aprovação exclusiva do artefato sintético temporário deste teste.
    meta['aprovado'] = True
    (tmp_path/'habitos.json').write_text(json.dumps(meta), encoding='utf-8')
    model = ModeloHabitos(tmp_path)
    result = model.predict(rows, 'p', rows[-1]['dia']+timedelta(days=1))
    assert len(result) == 1 and len(result[0]['previsoes']) == 30
