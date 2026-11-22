"""Polling da fila existente; nenhuma conexão MQTT ou treinamento no startup."""
import json
import logging
import os
import signal
import sqlite3
import threading
import time
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from .database import Database, DatabaseError
from .localization import localize, InvalidEvent
from .inference import Predictor
from .provenance import operational_reference, worker_lock, CalibrationError


class Outbox:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True,exist_ok=True)
        self.conn = sqlite3.connect(path)
        self.conn.execute('PRAGMA journal_mode=WAL')
        self.conn.execute('CREATE TABLE IF NOT EXISTS predictions(id TEXT PRIMARY KEY,payload TEXT NOT NULL)')

    def add(self, prediction):
        with self.conn:
            self.conn.execute('INSERT OR REPLACE INTO predictions VALUES (?,?)',
                              (prediction['id'],json.dumps(prediction,allow_nan=False)))

    def flush(self, db):
        failure = None
        for identifier,payload in self.conn.execute('SELECT id,payload FROM predictions ORDER BY id LIMIT 50').fetchall():
            row = json.loads(payload)
            if row['propriedade_id'] != db.property_id:
                continue
            try:
                db.upsert('argos_predicoes',row,'propriedade_id,animal_id,evento_id,modelo_versao')
            except DatabaseError as error:
                failure = error
                continue
            with self.conn:
                self.conn.execute('DELETE FROM predictions WHERE id=?',(identifier,))
        if failure:
            raise failure

    def depth(self):
        return self.conn.execute('SELECT count(*) FROM predictions').fetchone()[0]


def process_job(db, job, write=False, predictors=(), outbox=None, coordinates=None, links=None):
    tx,event = job['transmissor_id'],job['evento_id']
    rows = db.rows('deteccoes',transmissor_id='eq.'+tx,evento_id='eq.'+event)
    if coordinates is None:
        coordinates = db.rows('argos_posicoes_receptores',order='receptor_id')
    if links is None:
        links = db.rows('vinculos',transmissor_id='eq.'+tx)
    try:
        position = localize(rows,coordinates,links)
    except InvalidEvent as error:
        state = str(error)
        if write:
            db.finish_job(job,{'estado':state})
        return state
    if not write:
        return 'localizavel_sem_gravar'
    db.upsert('argos_localizacoes',position,'propriedade_id,transmissor_id,evento_id')
    logging.info('localizacao_qualidade: %s',json.dumps({'rms_m':position['erro_residual_m'],
        'receptores':position['receptores_utilizados']}))
    # Uma falha da IA não desfaz nem bloqueia a localização.
    if position['animal_id'] and position['observado_em']:
        for predictor in predictors:
            if predictor.model is None:
                continue
            try:
                c = predictor.cfg
                lower = (datetime.fromisoformat(position['observado_em'])-timedelta(seconds=(c.steps+3)*c.interval_s)).isoformat()
                history = db.rows('argos_localizacoes',
                    animal_id='eq.'+position['animal_id'],transmissor_id='eq.'+tx,
                    **{'and':f'(observado_em.gte.{lower},observado_em.lte.{position["observado_em"]})',
                       'order':'observado_em,id'})
                prediction = predictor.predict(history,db.property_id,operational_reference(coordinates,db.property_id))
                if prediction and outbox:
                    outbox.add(prediction)
            except Exception:
                logging.warning('inferencia_indisponivel_localizacao_preservada')
    db.finish_job(job,{'estado':'localizado'})
    return 'localizado'


def run(once=False, min_receivers=None):
    write = os.getenv('ARGOS_WRITE_ENABLED','0') == '1'
    if min_receivers is not None:
        if not once or min_receivers < 3 or write:
            raise ValueError('Diagnóstico exige --once, mínimo >=3 e ARGOS_WRITE_ENABLED=0')
        from .diagnostics import diagnose
        return diagnose(Database.environment(), min_receivers)
    db = Database.environment()
    if not write and not once:
        raise ValueError('Use --once para auditoria sem escrita')
    if write:
        operational_reference(db.rows('argos_posicoes_receptores',order='receptor_id'),db.property_id)
        with worker_lock(db.property_id):
            return _poll(db,write,once)
    return _poll(db,write,once)


def _poll(db, write, once):
    predictors = [Predictor(os.getenv(k)) for k in ('ARGOS_MODEL_DIR','ARGOS_BEHAVIOR_MODEL_DIR')]
    logging.info('modelos: %s',[p.status for p in predictors])
    outbox = Outbox(os.getenv('ARGOS_STATE_PATH','data/state.sqlite')) if write else None
    stop = threading.Event()
    for sig in (signal.SIGINT,signal.SIGTERM):
        signal.signal(sig,lambda *_: stop.set())
    while not stop.is_set():
        started = time.perf_counter()
        counts = Counter()
        try:
            coordinates = None
            links_by_tx = {}
            for job in db.jobs(datetime.now(timezone.utc).isoformat()):
                try:
                    if coordinates is None:
                        coordinates = db.rows('argos_posicoes_receptores',order='receptor_id')
                        if write:
                            operational_reference(coordinates,db.property_id)
                    tx = job['transmissor_id']
                    if tx not in links_by_tx:
                        links_by_tx[tx] = db.rows('vinculos',transmissor_id='eq.'+tx)
                    state = process_job(db,job,write,predictors,outbox,coordinates,links_by_tx[tx])
                    counts[state] += 1
                    logging.info('localizacao: %s',state)
                except CalibrationError:
                    # Calibração mudou: não confirmar, reagendar nem gravar neste ciclo.
                    logging.error('calibracao_alterada_worker_interrompido')
                    raise
                except Exception:
                    counts['falha_temporaria'] += 1
                    logging.warning('job_falhou_retry_preservado')
                    if write:
                        attempts = job['tentativas']+1
                        db.finish_job(job,{'tentativas':attempts,'disponivel_em':
                            (datetime.now(timezone.utc)+timedelta(seconds=min(300,2**min(attempts,8)))).isoformat()})
            if outbox:
                try:
                    outbox.flush(db)
                except DatabaseError:
                    logging.warning('predicoes_preservadas_na_outbox_verifique_schema_e_conexao')
        except DatabaseError:
            logging.warning('banco_indisponivel_fila_preservada')
        logging.info('worker_metricas: %s',json.dumps({'resultados':dict(counts),
            'latencia_ciclo_ms':round((time.perf_counter()-started)*1000,2),
            'outbox_pendente':outbox.depth() if outbox else 0,'escrita':write}))
        if once:
            return
        stop.wait(max(1,float(os.getenv('ARGOS_POLL_SECONDS','5'))))
