import copy
import pytest
from argos_ml.datasets import seal_dataset,verify_dataset
from conftest import history,P


def test_reproducible_and_tampering():
    rows=history(10)
    ref=dict(property_id=P,version='development-v1',calibration_sha256='fixture',validated=False)
    a=seal_dataset(rows,[],'experimental',ref)
    b=seal_dataset(list(reversed(rows)),[],'experimental',ref)
    assert a['dataset_sha256']==b['dataset_sha256']
    verify_dataset(a)
    corrupted=copy.deepcopy(a);corrupted['localizacoes'][0]['x_m']+=1
    with pytest.raises(ValueError):verify_dataset(corrupted)
    with pytest.raises(ValueError):seal_dataset(rows,[],'real',ref)
    with pytest.raises(ValueError):seal_dataset(rows+[{**rows[0],'propriedade_id':'other'}],[],'experimental',ref)


def test_legacy_real_is_not_approved_input():
    with pytest.raises(ValueError):verify_dataset(dict(source='supabase-reviewed',localizacoes=history(10)))
