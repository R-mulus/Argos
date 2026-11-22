"""Polling da fila existente; nenhuma conexão MQTT ou treinamento no startup."""
import json
import logging
import os
import signal
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from .database import Database, DatabaseError
from .localization import localize, InvalidEvent
from .inference import Predictor


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
        for identifier,payload in self.conn.execute('SELECT id,payload FROM predictions ORDER BY id LIMIT 50').fetchall():
            db.upsert('argos_predicoes',json.loads(payload),'propriedade_id,animal_id,evento_id,modelo_versao')
            with self.conn:
                self.conn.execute('DELETE FROM predictions WHERE id=?',(identifier,))


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
                prediction = predictor.predict(history,db.property_id)
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
    predictors = [Predictor(os.getenv(k)) for k in ('ARGOS_MODEL_DIR','ARGOS_BEHAVIOR_MODEL_DIR')]
    logging.info('modelos: %s',[p.status for p in predictors])
    outbox = Outbox(os.getenv('ARGOS_STATE_PATH','data/state.sqlite')) if write else None
    stop = threading.Event()
    for sig in (signal.SIGINT,signal.SIGTERM):
        signal.signal(sig,lambda *_: stop.set())
    while not stop.is_set():
        try:
            coordinates = None
            links_by_tx = {}
            for job in db.jobs(datetime.now(timezone.utc).isoformat()):
                try:
                    if coordinates is None:
                        coordinates = db.rows('argos_posicoes_receptores',order='receptor_id')
                    tx = job['transmissor_id']
                    if tx not in links_by_tx:
                        links_by_tx[tx] = db.rows('vinculos',transmissor_id='eq.'+tx)
                    logging.info('localizacao: %s',process_job(db,job,write,predictors,outbox,coordinates,links_by_tx[tx]))
                except Exception:
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
        if once:
            return
        stop.wait(max(1,float(os.getenv('ARGOS_POLL_SECONDS','5'))))
