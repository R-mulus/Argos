"""Artefatos locais reproduzíveis; experimentos nunca são rotulados como operação real."""
from .provenance import digest


def seal_dataset(rows, labels, source, reference, cameras=()):
    if source not in ('experimental','real','synthetic'):
        raise ValueError('origem_dataset_invalida')
    properties={r['propriedade_id'] for r in rows}
    if len(properties)>1 or (properties and properties!={reference['property_id']}):
        raise ValueError('dataset_mistura_propriedades')
    if any(r['propriedade_id']!=reference['property_id'] for r in labels):
        raise ValueError('rotulos_de_outra_propriedade')
    if source=='real' and not reference.get('validated'):
        raise ValueError('referencial_real_nao_validado')
    result=dict(schema_version=2,source=source,reference=reference,
        localizacoes=sorted(rows,key=lambda r:(r['propriedade_id'],r.get('animal_id') or '',r.get('observado_em') or '',r['evento_id'])),
        rotulos=sorted(labels,key=lambda r:(r['animal_id'],r['observado_em'],r['id'])),
        trusted_cameras=sorted(set(cameras)))
    result['dataset_sha256']=digest(result)
    return result


def verify_dataset(dataset):
    if dataset.get('schema_version')!=2:
        # Compatibilidade apenas com fixtures legadas, nunca aprovação de dados reais sem manifesto.
        if not dataset.get('source','').startswith('synthetic'):
            raise ValueError('dataset_sem_manifesto_de_origem')
        return
    payload={k:v for k,v in dataset.items() if k!='dataset_sha256'}
    if digest(payload)!=dataset.get('dataset_sha256'):
        raise ValueError('dataset_alterado_apos_exportacao')
    rebuilt=seal_dataset(dataset['localizacoes'],dataset['rotulos'],dataset['source'],dataset['reference'],dataset['trusted_cameras'])
    if rebuilt['dataset_sha256']!=dataset['dataset_sha256']:
        raise ValueError('dataset_fora_do_contrato')
