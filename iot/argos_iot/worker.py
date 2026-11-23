"""Consome jobs transacionais gerados pela ingestão MQTT existente. Sem API pública."""
import logging
import os
import signal
import threading
from datetime import timedelta
from uuid import NAMESPACE_URL, uuid5
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from dotenv import load_dotenv
from .eventos import localizar
from .ml import ModeloGRU

KEY = 'propriedade_id=%s AND transmissor_id=%s AND evento_id=%s'


def process_one(conn, model):
    with conn.transaction():
        job = conn.execute("""SELECT * FROM public.argos_iot_jobs WHERE estado='pendente'
          AND disponivel_em <= now() ORDER BY disponivel_em LIMIT 1 FOR UPDATE SKIP LOCKED""").fetchone()
        if not job:
            return False
        key = tuple(job[k] for k in ('propriedade_id', 'transmissor_id', 'evento_id'))
        try:
            # Savepoint: falha parcial nunca confirma localização sem marcar retry.
            with conn.transaction():
                rows = conn.execute("""SELECT d.*, p.x_m,p.y_m,p.rssi_1m_dbm,p.expoente_perda,v.animal_id
                  FROM public.deteccoes d JOIN public.argos_posicoes_receptores p
                    ON p.receptor_id=d.receptor_id AND p.propriedade_id=d.propriedade_id
                  LEFT JOIN public.vinculos v ON v.id=d.vinculo_id AND v.propriedade_id=d.propriedade_id
                    AND v.transmissor_id=d.transmissor_id
                  WHERE d.propriedade_id=%s AND d.transmissor_id=%s AND d.evento_id=%s
                  ORDER BY d.receptor_id""", key).fetchall()
                position, state = localizar(rows)
                if position:
                    identifier = uuid5(NAMESPACE_URL, ':'.join(map(str, key)))
                    conn.execute("""INSERT INTO public.argos_localizacoes
                      (id,propriedade_id,transmissor_id,evento_id,animal_id,x_m,y_m,erro_residual_m,
                       receptores_utilizados,observado_em,calculado_em)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
                      ON CONFLICT (propriedade_id,transmissor_id,evento_id) DO UPDATE SET
                      x_m=excluded.x_m,y_m=excluded.y_m,erro_residual_m=excluded.erro_residual_m,
                      receptores_utilizados=excluded.receptores_utilizados,calculado_em=now(),
                      animal_id=excluded.animal_id,observado_em=excluded.observado_em""",
                      (identifier, *key, position['animal_id'], position['x_m'], position['y_m'],
                       position['erro_residual_m'], position['receptores_utilizados'], position['observado_em']))
                    # IA opcional não pode bloquear persistência de RSSI.
                    try:
                        with conn.transaction():
                            infer(conn, model, key, position)
                    except Exception:
                        logging.warning('Inferência indisponível; posição RSSI preservada', exc_info=False)
                conn.execute('UPDATE public.argos_iot_jobs SET estado=%s,atualizado_em=now() WHERE ' + KEY,
                             (state, *key))
        except Exception:
            logging.warning('Job falhou; retry com backoff (credenciais omitidas)')
            conn.execute('UPDATE public.argos_iot_jobs SET tentativas=tentativas+1, '
                "disponivel_em=now() + %s * interval '1 second' WHERE " + KEY,
                (min(300, 2 ** min(job['tentativas'] + 1, 8)), *key))
    return True


def infer(conn, model, key, position):
    if model.model is None:
        return
    history = conn.execute("""SELECT l.*,
      (SELECT jsonb_object_agg(d.receptor_id::text,d.rssi_dbm) FROM public.deteccoes d
        WHERE d.propriedade_id=l.propriedade_id AND d.transmissor_id=l.transmissor_id
          AND d.evento_id=l.evento_id) AS rssi
      FROM public.argos_localizacoes l WHERE l.propriedade_id=%s AND l.animal_id=%s
       AND l.transmissor_id=%s AND l.observado_em <= %s
      ORDER BY l.observado_em DESC,l.evento_id DESC LIMIT %s""",
      (key[0], position['animal_id'], key[1], position['observado_em'], model.meta['steps'])).fetchall()
    history.reverse()
    if not history or history[-1]['evento_id'] != key[2]:
        return
    geometria = {str(r['receptor_id']): r for r in conn.execute(
        """SELECT receptor_id,x_m,y_m,rssi_1m_dbm,expoente_perda FROM public.argos_posicoes_receptores
        WHERE propriedade_id=%s""", (key[0],)).fetchall()}
    result = model.predict(history, key[0], geometria)
    if not result:
        return
    identifier = uuid5(NAMESPACE_URL, ':'.join(map(str, (*key, result['modelo_versao']))))
    conn.execute("""INSERT INTO public.argos_predicoes
      (id,propriedade_id,animal_id,evento_id,observado_em,previsto_para,atual_x_m,atual_y_m,
       proximo_x_m,proximo_y_m,comportamento,confianca,probabilidades,modelo_versao,criado_em)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
      ON CONFLICT (propriedade_id,animal_id,evento_id,modelo_versao) DO UPDATE SET
      atual_x_m=excluded.atual_x_m,atual_y_m=excluded.atual_y_m,
      proximo_x_m=excluded.proximo_x_m,proximo_y_m=excluded.proximo_y_m,
      comportamento=excluded.comportamento,confianca=excluded.confianca,
      probabilidades=excluded.probabilidades,criado_em=now()""",
      (identifier, key[0], position['animal_id'], key[2], position['observado_em'],
       position['observado_em'] + timedelta(seconds=result['horizonte_s']),
       result['atual_x_m'], result['atual_y_m'], result['proximo_x_m'], result['proximo_y_m'],
       result['comportamento'], result['confianca'], Jsonb(result['probabilidades']), result['modelo_versao']))


def main():
    load_dotenv()
    logging.basicConfig(level=logging.INFO)
    url = os.environ['DATABASE_URL']
    if not url.startswith(('postgresql://', 'postgres://')):
        raise ValueError('Use DATABASE_URL PostgreSQL (psycopg direto, sem +psycopg)')
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    try:
        model = ModeloGRU(os.getenv('ARGOS_MODEL_DIR'))
    except Exception:
        logging.warning('Modelo inválido/indisponível; mantendo RSSI')
        model = ModeloGRU(None)
    logging.info('GRU: %s', model.status)
    delay = max(1, float(os.getenv('ARGOS_POLL_SECONDS', '2')))
    while not stop.is_set():
        try:
            with psycopg.connect(url, row_factory=dict_row, connect_timeout=10,
                                options='-c statement_timeout=15000') as conn:
                while not stop.is_set():
                    if not process_one(conn, model):
                        stop.wait(delay)
        except psycopg.Error:
            logging.warning('Banco indisponível; jobs persistentes serão retomados')
            stop.wait(10)


if __name__ == '__main__':
    main()
