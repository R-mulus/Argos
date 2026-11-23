import json
import numpy as np
import pandas as pd
import pytest
from argos_ml.config import SeriesConfig,LABELS
from argos_ml.preprocessing import features,sequences,chronological_split,FEATURES,trusted_labels
from argos_ml.kpis import summarize_movement,behavior_distribution,receiver_summary
from argos_ml.inference import Predictor
from conftest import history,P,A,T


CFG=SeriesConfig(steps=4,horizon_s=60)


def test_sequences_split_no_overlap():
    rows=history()
    parts=chronological_split(rows)
    times=[{r['observado_em'] for r in part} for part in parts]
    assert not(times[0]&times[1] or times[1]&times[2])
    for part in parts:
        x,y,baseline,targets=sequences(part,CFG)
        assert x.shape[1:]==(4,len(FEATURES)) and y.shape[1]==2
        assert np.isfinite(x).all() and len(x)==len(targets)==len(baseline)
    # Cada partição recalcula atributos; nenhum delta usa observação da partição anterior.
    assert features(parts[1],CFG).iloc[0].observado_em > pd.Timestamp(parts[1][0]['observado_em'])


def test_gap_outlier_no_bridge():
    rows=history(30)
    rows[10]['x_m']=1e9
    x,*_=sequences(rows[:15]+rows[20:],CFG)
    assert np.isfinite(x).all()
    assert (x[:,:,5]==60).all()
    assert (x[:,:,4]<8).all()
    assert len(x)<len(sequences(history(30),CFG)[0])


def test_no_animal_mixing():
    rows=history(5)+[{**r,'animal_id':'another'} for r in history(5)]
    assert len(sequences(rows,CFG)[0])==0


def test_label_provenance_conflicts():
    r=dict(propriedade_id=P,animal_id=A,observado_em='2026-01-01T00:00:00Z',camera_id='camera',comportamento='comendo',confianca=.9)
    assert not trusted_labels([r],[],CFG)
    assert len(trusted_labels([r],['camera'],CFG))==1
    assert not trusted_labels([r,{**r,'comportamento':'parado'}],['camera'],CFG)


@pytest.mark.parametrize('period',['dia','semana','mes'])
def test_kpi_coverage_distance_and_missing(period):
    rows=history(3)
    for i,r in enumerate(rows): r.update(x_m=i*60,y_m=0,erro_residual_m=0)
    kpi=summarize_movement(rows,'2026-01-01T00:00:00Z','2026-01-01T01:00:00Z',period)
    assert sum(p['distancia_estimada_m'] or 0 for p in kpi['pontos'])==120
    assert kpi['pontos'][0]['velocidade_media_estimada_m_s']==1
    assert kpi['pontos'][0]['cobertura_percentual']==pytest.approx(100*120/3600)
    empty=summarize_movement([],'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z',period)
    assert all(p['distancia_estimada_m'] is None and p['cobertura_percentual']==0 for p in empty['pontos'])


def test_behavior_percent_and_source():
    rows=[dict(propriedade_id=P,animal_id=A,observado_em=f'2026-01-01T00:0{i}:00Z',camera_id='c',comportamento='comendo',confianca=.95) for i in range(3)]
    result=behavior_distribution(rows,'2026-01-01T00:00:00Z','2026-01-01T01:00:00Z',['c'])
    assert result['percentuais']['comendo']==100
    assert sum(result['percentuais'].values())==100
    assert result['origem']=='observado_validado'
    assert result['cobertura_percentual']<4
    assert not behavior_distribution(rows,'2026-01-01T00:00:00Z','2026-01-01T01:00:00Z',[])['disponivel']


def test_no_approved_model(tmp_path):
    assert Predictor().predict([],P) is None
    (tmp_path/'manifest.json').write_text(json.dumps(dict(approved=False)))
    assert Predictor(tmp_path).status=='nao_aprovado'


def test_receiver_is_not_wifi_or_battery():
    result=receiver_summary(dict(id='rx',propriedade_id=P),[], '2026-01-01T00:00:00Z')
    assert result['status']=='sem_deteccoes_recentes'
    assert result['bateria_receptor_percentual'] is None and result['perdas_de_sinal'] is None


def test_overlapping_collars_are_not_double_counted():
    rows=history(3)+[{**r,'transmissor_id':'another'} for r in history(3)]
    result=summarize_movement(rows,'2026-01-01T00:00:00Z','2026-01-01T01:00:00Z')
    assert result['pontos'][0]['cobertura_percentual']==0
