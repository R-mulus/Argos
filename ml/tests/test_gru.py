import json
import numpy as np
import pytest
from argos_ml.config import SeriesConfig,LABELS
from argos_ml.preprocessing import FEATURES,sequences,chronological_split
from argos_ml.training import train,approve,regression_metrics,evaluate_saved
from argos_ml.inference import Predictor
from argos_ml.datasets import seal_dataset
from conftest import history,P


@pytest.mark.parametrize('task',['position','behavior'])
@pytest.mark.parametrize('source',['synthetic','experimental'])
def test_train_save_load_predict_synthetic(tmp_path,task,source):
    tf=pytest.importorskip('tensorflow')
    rows=history(600)
    dataset=seal_dataset(rows,
        [dict(id=str(i),propriedade_id=r['propriedade_id'],animal_id=r['animal_id'],observado_em=r['observado_em'],
              comportamento=LABELS[(i//10)%4],camera_id='test',confianca=1) for i,r in enumerate(rows)],
        source,dict(property_id=P,version='test-only',calibration_sha256='a'*64,validated=False),['test'])
    cfg=SeriesConfig(steps=4,horizon_s=60)
    directory=tmp_path/task
    manifest=train(dataset,directory,cfg,task,epochs=2)
    assert manifest['synthetic']==(source=='synthetic') and not manifest['approved']
    assert manifest['training_samples']>0 and manifest['test_samples']>0
    assert manifest['model_parameters']<10000
    train_x=sequences(chronological_split(rows)[0],cfg)[0]
    assert np.allclose(manifest['feature_mean'],train_x.reshape(-1,len(FEATURES)).mean(axis=0),atol=.0001)
    with pytest.raises(ValueError):approve(directory,'test')
    model=tf.keras.models.load_model(directory/'model.keras',compile=False)
    output=np.asarray(model(np.zeros((1,4,len(FEATURES)),dtype='float32'),training=False))
    assert output.shape==(1,2 if task=='position' else 4)
    # Força aprovação SOMENTE em diretório temporário para testar o caminho de inferência.
    original=dict(manifest)
    manifest.update(approved=True,synthetic=False,reviewed_real_data=True,improves_baseline=True,source='real',
                    reference={**manifest['reference'],'validated':True})
    (directory/'manifest.json').write_text(json.dumps(manifest))
    predictor=Predictor(directory)
    # Nunca deixa artefato sintético marcado como aprovado, mesmo se alguma asserção falhar.
    (directory/'manifest.json').write_text(json.dumps(original))
    assert predictor.status=='disponivel'
    reference=manifest['reference']
    rows=[{**r,'referencial_versao':reference['version'],'calibracao_sha256':reference['calibration_sha256'],'origem':'real'} for r in rows]
    result=predictor.predict(rows[-10:],P,reference)
    assert result is not None and result['previsto_para']>result['observado_em']
    if task=='position':assert result['comportamento'] is None
    else:assert sum(result['probabilidades'].values())==pytest.approx(1,abs=1e-5)
    assert predictor.predict(rows[:2],P,reference) is None
    assert predictor.predict(rows,'wrong-property',reference) is None
    assert predictor.predict(rows[-10:],P,{**reference,'version':'different'}) is None
    assert predictor.predict([{**r,'propriedade_id':'other'} for r in rows[-10:]],P,reference) is None
    assert predictor.predict(rows[-10:]+[{**rows[-1],'animal_id':'other'}],P,reference) is None
    predictor.model=lambda *a,**k: np.full((1,2 if task=='position' else 4),np.nan)
    assert predictor.predict(rows[-10:],P,reference) is None
    evaluated=evaluate_saved(directory)
    key='rmse_m' if task=='position' else 'classification_accuracy'
    assert evaluated[key]==pytest.approx(original['evaluation'][key])
    with (directory/'heldout.npz').open('ab') as altered:altered.write(b'changed')
    with pytest.raises(ValueError):evaluate_saved(directory)


def test_invalid_metrics():
    with pytest.raises(ValueError):regression_metrics([[1,2]],[[np.inf,2]])
