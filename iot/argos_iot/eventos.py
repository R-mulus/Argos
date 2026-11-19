"""Agrupamento estrito do mesmo beacon; vínculo histórico vem da ingestão canônica."""
from .localizacao import trilaterar


def localizar(rows):
    if len(rows) < 3:
        return None, 'receptores_insuficientes'
    identities = {(r['propriedade_id'], r['transmissor_id'], r['evento_id']) for r in rows}
    if len(identities) != 1 or len({r['receptor_id'] for r in rows}) != len(rows):
        raise ValueError('Não misturar eventos nem repetir receptores')
    dates = [r['detectado_em'] for r in rows]
    if any(d is None for d in dates):
        return None, 'sem_horario'
    # Sem histórico de calibração, a configuração nova não explica um evento antigo.
    if any(r.get('calibracao_em') and r['calibracao_em'] > r['detectado_em'] for r in rows):
        return None, 'calibracao_posterior'
    if (max(dates) - min(dates)).total_seconds() > 2:
        return None, 'horarios_incompativeis'
    animals = {r['animal_id'] for r in rows}
    if len(animals) != 1 or None in animals:
        return None, 'vinculo_incompativel'
    try:
        position = trilaterar(rows)
    except ValueError:
        return None, 'geometria_invalida'
    position.pop('aviso', None)
    return {**position, 'animal_id': rows[0]['animal_id'], 'observado_em': min(dates)}, 'localizado'
