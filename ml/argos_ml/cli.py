"""Comandos explícitos. Nunca treina nem altera schema ao iniciar worker."""
import argparse
import json
import logging
import os
from pathlib import Path
from dotenv import load_dotenv
from .config import SeriesConfig
from .database import Database
from .training import save_json


def main():
    p = argparse.ArgumentParser(prog='python -m argos_ml.cli')
    p.add_argument('--env',default='.env')
    sub = p.add_subparsers(dest='command',required=True)
    w = sub.add_parser('worker'); w.add_argument('--once',action='store_true')
    w.add_argument('--min-receivers',type=int,help='Diagnóstico somente leitura de jobs com N receptores calibrados (N>=3); exige --once')
    prepare = sub.add_parser('prepare')
    prepare.add_argument('--out',required=True)
    prepare.add_argument('--since',required=True); prepare.add_argument('--until',required=True)
    prepare.add_argument('--trusted-camera',action='append',default=[])
    prepare.add_argument('--reviewed-real-data',action='store_true',help='Confirma revisão humana da origem real e do referencial')
    train = sub.add_parser('train')
    train.add_argument('--dataset',required=True); train.add_argument('--out',required=True)
    train.add_argument('--task',choices=['position','behavior'],default='position')
    train.add_argument('--steps',type=int,default=30); train.add_argument('--interval-s',type=int,default=60)
    train.add_argument('--horizon-s',type=int,default=300); train.add_argument('--epochs',type=int,default=50)
    for name in ('evaluate','approve','infer'):
        cmd = sub.add_parser(name); cmd.add_argument('--model',required=True)
        if name=='approve': cmd.add_argument('--reviewer',required=True)
        if name=='infer': cmd.add_argument('--dataset',required=True)
    k = sub.add_parser('kpis'); k.add_argument('--animal',required=True)
    k.add_argument('--since',required=True); k.add_argument('--until',required=True)
    k.add_argument('--period',choices=['dia','semana','mes'],default='dia'); k.add_argument('--out',required=True)
    sub.add_parser('audit')
    backfill = sub.add_parser('requeue')
    backfill.add_argument('--since',required=True); backfill.add_argument('--until',required=True)
    args = p.parse_args()
    load_dotenv(args.env)
    if args.command=='worker' and args.min_receivers is not None:
        if not args.once or args.min_receivers < 3 or os.getenv('ARGOS_WRITE_ENABLED','0')=='1':
            p.error('--min-receivers exige --once, N>=3 e ARGOS_WRITE_ENABLED=0')
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    if args.command=='worker':
        from .worker import run
        run(args.once, args.min_receivers)
    elif args.command=='train':
        from .training import train as fit
        m = fit(json.loads(Path(args.dataset).read_text(encoding='utf-8')),args.out,
            SeriesConfig(steps=args.steps,interval_s=args.interval_s,horizon_s=args.horizon_s),args.task,args.epochs)
        print(json.dumps({k:m[k] for k in ('model_version','approved','evaluation','baseline')},indent=2))
    elif args.command=='approve':
        from .training import approve
        approve(args.model,args.reviewer)
    elif args.command=='evaluate':
        import numpy as np
        import tensorflow as tf
        from .training import regression_metrics
        path=Path(args.model); m=json.loads((path/'manifest.json').read_text())
        model=tf.keras.models.load_model(path/'model.keras',compile=False)
        with np.load(path/'heldout.npz',allow_pickle=False) as test:
            prediction=np.asarray(model(test['x'],training=False))
            if not np.isfinite(prediction).all(): raise ValueError('resultado_invalido')
            result=regression_metrics(test['y'],prediction*m['target_scale']+m['target_mean']) if m['task']=='position' else {
                'classification_accuracy':float(np.mean(prediction.argmax(axis=1)==test['y']))}
        print(json.dumps(result,indent=2))
    elif args.command=='infer':
        from .inference import Predictor
        model=Predictor(args.model)
        dataset=json.loads(Path(args.dataset).read_text(encoding='utf-8'))
        rows=dataset['localizacoes']
        identities={(r['propriedade_id'],r['animal_id'],r['transmissor_id']) for r in rows}
        if len(identities)!=1: raise ValueError('Selecione histórico de um animal/transmissor')
        prediction=model.predict(rows,next(iter(identities))[0])
        print(json.dumps({'status':model.status,'previsao':prediction},indent=2))
    elif args.command=='audit':
        db=Database.environment()
        counts={table:len(db.rows(table,select=key,order=key)) for table,key in [
            ('deteccoes','id'),('argos_posicoes_receptores','receptor_id'),('argos_localizacoes','id'),
            ('argos_observacoes_visao','id'),('argos_predicoes','id')]}
        print(json.dumps(counts,indent=2))
    else:
        from .localization import timestamp
        start,end=timestamp(args.since),timestamp(args.until)
        if not start or not end or start>=end: raise ValueError('periodo_invalido')
        db=Database.environment()
        if args.command=='prepare':
            bounds=f'(observado_em.gte.{start.isoformat()},observado_em.lt.{end.isoformat()})'
            dataset=dict(source='supabase-reviewed' if args.reviewed_real_data else 'supabase-unreviewed',
                localizacoes=db.rows('argos_localizacoes',**{'and':bounds,'order':'observado_em,id'}),
                rotulos=db.rows('argos_observacoes_visao',**{'and':bounds,'order':'observado_em,id'}),
                trusted_cameras=args.trusted_camera)
            Path(args.out).parent.mkdir(parents=True,exist_ok=True)
            save_json(args.out,dataset)
            print(json.dumps({'localizacoes':len(dataset['localizacoes']),'rotulos':len(dataset['rotulos'])}))
        elif args.command=='requeue':
            from datetime import datetime,timezone
            rows=db.rows('deteccoes',**{'and':f'(recebido_em.gte.{start.isoformat()},recebido_em.lt.{end.isoformat()})'})
            keys=sorted({(r['transmissor_id'],r['evento_id']) for r in rows})
            if os.getenv('ARGOS_WRITE_ENABLED','0')=='1':
                for tx,event in keys:
                    now=datetime.now(timezone.utc).isoformat()
                    db.upsert('argos_iot_jobs',dict(propriedade_id=db.property_id,transmissor_id=tx,evento_id=event,
                        estado='pendente',tentativas=0,disponivel_em=now,atualizado_em=now),'propriedade_id,transmissor_id,evento_id')
            print(json.dumps({'eventos':len(keys),'gravacao':os.getenv('ARGOS_WRITE_ENABLED','0')=='1'}))
        elif args.command=='kpis':
            from uuid import UUID
            from datetime import timedelta
            from .kpis import summarize_movement
            animal=str(UUID(args.animal))
            bounds=f'(observado_em.gte.{(start-timedelta(seconds=120)).isoformat()},observado_em.lte.{(end+timedelta(seconds=120)).isoformat()})'
            rows=db.rows('argos_localizacoes',animal_id='eq.'+animal,**{'and':bounds,'order':'observado_em,id'})
            Path(args.out).parent.mkdir(parents=True,exist_ok=True)
            save_json(args.out,summarize_movement(rows,start,end,args.period))


if __name__=='__main__':
    try:
        main()
    except Exception as error:
        # Mensagens de bibliotecas de rede podem incluir URL/chaves; só a classe é impressa.
        logging.error('Comando falhou (%s). Confira configuração, schema e disponibilidade de dados.',type(error).__name__)
        raise SystemExit(1) from None
