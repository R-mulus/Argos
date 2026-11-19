"""Consolidação diária e previsão mensal independentes da trilateração experimental."""
import argparse
import json
import logging
import os
import signal
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from dotenv import load_dotenv
from .habitos import ModeloHabitos, STEPS


def consolidate(conn, property_id, start, end):
    # Um animal por intervalo: última observação e disputa de RSSI de dois segundos.
    # Não preencher zona nula com o cadastro atual, nem usar recebido_em como detecção.
    rows = conn.execute("""WITH readings AS (
      SELECT v.animal_id, d.zona_id, d.detectado_em, d.rssi_dbm, d.receptor_id,
        floor(extract(epoch FROM d.detectado_em)/300) AS slot
      FROM public.deteccoes d JOIN public.vinculos v
        ON v.id=d.vinculo_id AND v.propriedade_id=d.propriedade_id
        AND v.transmissor_id=d.transmissor_id
        AND d.detectado_em >= v.inicio_em
        AND (v.fim_em IS NULL OR d.detectado_em < v.fim_em)
      WHERE d.propriedade_id=%s AND d.detectado_em >= %s AND d.detectado_em < %s
        AND d.zona_id IS NOT NULL
    ), recent AS (
      SELECT *, max(detectado_em) OVER (PARTITION BY animal_id,slot) AS latest FROM readings
    ), winners AS (
      SELECT DISTINCT ON (animal_id,slot) animal_id, zona_id, latest
      FROM recent WHERE detectado_em >= latest - interval '2 seconds'
      ORDER BY animal_id,slot,rssi_dbm DESC,detectado_em DESC,receptor_id
    ), counts AS (
      SELECT animal_id,(latest AT TIME ZONE 'UTC')::date AS dia,zona_id,count(*) AS total
      FROM winners GROUP BY animal_id,dia,zona_id
    ) SELECT animal_id,dia,jsonb_object_agg(zona_id::text,total) AS contagens
      FROM counts GROUP BY animal_id,dia""", (property_id, start, end)).fetchall()
    for row in rows:
        conn.execute("""INSERT INTO public.argos_habitos_diarios
          (propriedade_id,animal_id,dia,contagens) VALUES (%s,%s,%s,%s)
          ON CONFLICT (propriedade_id,animal_id,dia) DO UPDATE
          SET contagens=excluded.contagens,atualizado_em=now()""",
          (property_id, row['animal_id'], row['dia'], Jsonb(row['contagens'])))
    return len(rows)


def snapshot(conn, property_id):
    zones = [str(r['id']) for r in conn.execute(
        'SELECT id FROM public.zonas WHERE propriedade_id=%s ORDER BY id', (property_id,))]
    rows = conn.execute('SELECT animal_id,dia,contagens FROM public.argos_habitos_diarios '
                        'WHERE propriedade_id=%s ORDER BY animal_id,dia', (property_id,)).fetchall()
    return dict(property_id=str(property_id), zones=zones, rows=rows)


def cycle(conn, property_id, model):
    now = datetime.now(timezone.utc)
    end = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Reprocessa dias completos recentes, sem substituir agregados antigos por dados
    # parcialmente removidos pela retenção. Backfill antigo requer janela explícita.
    with conn.transaction():
        consolidate(conn, property_id, end-timedelta(days=7), end)
        if model.model is None:
            return 0
        zones = [str(r['id']) for r in conn.execute(
            'SELECT id FROM public.zonas WHERE propriedade_id=%s ORDER BY id', (property_id,))]
        if zones != model.meta['zones']:
            logging.warning('Zonas mudaram: previsão suspensa; consolidação preservada. Retreine o modelo.')
            return 0
        rows = conn.execute('SELECT animal_id,dia,contagens FROM public.argos_habitos_diarios '
            'WHERE propriedade_id=%s AND dia >= %s AND dia < %s',
            (property_id, end.date()-timedelta(days=STEPS), end.date())).fetchall()
        try:
            results = model.predict(rows, property_id, end.date())
        except Exception:
            logging.warning('Inferência inválida: consolidação preservada, nenhuma previsão gravada')
            return 0
        for result in results:
            conn.execute("""INSERT INTO public.argos_previsoes_habitos
              (propriedade_id,animal_id,observado_em,modelo_versao,previsoes)
              VALUES (%s,%s,%s,%s,%s)
              ON CONFLICT (propriedade_id,animal_id,observado_em,modelo_versao)
              DO UPDATE SET previsoes=excluded.previsoes,criado_em=now()""",
              (property_id, result['animal_id'], result['observado_em'],
               result['modelo_versao'], Jsonb(result['previsoes'])))
        return len(results)


def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--property', required=True, type=UUID)
    parser.add_argument('--export', help='Exporta agregados existentes para treinamento')
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    try:
        model = ModeloHabitos(os.getenv('ARGOS_HABITOS_MODEL_DIR'))
    except Exception:
        logging.warning('Modelo indisponível: continuando apenas a consolidação diária')
        model = ModeloHabitos(None)
    if model.meta and model.meta['property_id'] != str(args.property):
        raise ValueError('Modelo pertence a outra propriedade')
    while not stop.is_set():
        try:
            with psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row,
                                connect_timeout=10, options='-c statement_timeout=60000') as conn:
                total = cycle(conn, args.property, model)
                logging.info('Ciclo concluído: %d animais com previsão; modelo aprovado: %s',
                             total, model.model is not None)
                if args.export:
                    Path(args.export).write_text(json.dumps(snapshot(conn, args.property), default=str), encoding='utf-8')
            if args.once or args.export:
                break
        except psycopg.Error:
            logging.error('Falha no banco; credenciais omitidas')
            if args.once or args.export:
                raise SystemExit(1)
        stop.wait(3600)


if __name__ == '__main__':
    main()
