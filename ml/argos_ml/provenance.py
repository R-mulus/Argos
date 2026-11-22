"""Origem e referencial explícitos; um flag de escrita sozinho não valida calibração."""
import hashlib
import json
import os
from contextlib import contextmanager
from pathlib import Path


class CalibrationError(ValueError):
    pass


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',', ':'),allow_nan=False).encode()).hexdigest()


def calibration_hash(coordinates, property_id: str) -> str:
    fields = ('receptor_id','propriedade_id','x_m','y_m','rssi_1m_dbm','expoente_perda')
    rows = [{k:c[k] for k in fields} for c in coordinates if c['propriedade_id']==property_id]
    return digest(sorted(rows,key=lambda row:row['receptor_id']))


def operational_reference(coordinates, property_id: str) -> dict:
    expected = os.getenv('ARGOS_CALIBRATION_SHA256','')
    version = os.getenv('ARGOS_REFERENCE_VERSION','')
    if (os.getenv('ARGOS_DATA_ORIGIN','experimental')!='real'
            or os.getenv('ARGOS_CALIBRATION_VALIDATED','0')!='1' or not version
            or expected != calibration_hash(coordinates,property_id)):
        raise CalibrationError('calibracao_operacional_nao_validada')
    if sum(c['propriedade_id']==property_id for c in coordinates)<3:
        raise CalibrationError('calibracao_operacional_insuficiente')
    return dict(version=version,calibration_sha256=expected,property_id=property_id,validated=True)


@contextmanager
def worker_lock(property_id: str):
    """Exclusão por propriedade no mesmo host/diretório. SO libera em caso de crash.

    Workers em hosts diferentes exigem coordenação transacional no banco; não são suportados.
    """
    directory = Path(os.getenv('ARGOS_LOCK_DIR','data/locks'))
    directory.mkdir(parents=True,exist_ok=True)
    with (directory/(digest(property_id)+'.lock')).open('a+b') as handle:
        handle.seek(0); handle.write(b'0'); handle.flush(); handle.seek(0)
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            raise RuntimeError('worker_da_propriedade_ja_em_execucao') from None
        try:
            yield
        finally:
            handle.seek(0)
            if os.name=='nt':
                msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)
            else:
                fcntl.flock(handle.fileno(),fcntl.LOCK_UN)
