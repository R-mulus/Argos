"""Experimento sintético isolado. Nunca registra modelo ou eventos operacionais."""
import argparse
import hashlib
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import numpy as np
from dotenv import load_dotenv
from .database import Database
from .localization import trilaterate, InvalidEvent
from .training import regression_metrics, save_json

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'ml/data/demo-v2.json'
MODEL = ROOT / 'ml/model/artifacts/posicao-demo-v2'
FEATURES = ['x_m','y_m','erro_residual_m','receptores_utilizados','idade_s']
CONFIG = dict(seed=20261125,steps=10,interval_s=6,horizon_s=30,units=32,batch_size=256,
              source='synthetic',target='coordenada de referência sintética futura',bounds=[-10,10,-7,11])


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def generate(path=DATA, sessions=100, length=600):
    if path.exists():
        raise ValueError('Dataset já existe; use outro --dataset para preservar o experimento.')
    if sessions < 10 or length < 30:
        raise ValueError('Exige pelo menos 10 sessões de 30 passos.')
    db = Database.environment()
    anchors = db.rows('argos_posicoes_receptores',order='receptor_id')
    if len(anchors)<3:
        raise ValueError('São necessários três receptores cadastrados.')
    rng = np.random.default_rng(CONFIG['seed'])
    rows=[]
    start = datetime(2026,1,1,tzinfo=timezone.utc)
    for session in range(sessions):
        xy=rng.uniform([-8,-5],[8,9]); angle=rng.uniform(-np.pi,np.pi)
        velocity=0.; resting=True; remaining=0; interference=np.zeros(len(anchors))
        last=None; age=0
        for step in range(length):
            if remaining<=0:
                resting=bool(rng.random()<.35)
                remaining=int(rng.integers(8,45) if resting else rng.integers(20,90))
                speed=0 if resting else rng.uniform(.08,.35)
            remaining-=1
            velocity=.75*velocity+.25*speed
            angle+=rng.normal(0,.13)
            delta=6*velocity*np.array([np.cos(angle),np.sin(angle)])
            target=xy+delta
            for axis,(low,high) in enumerate([(-10,10),(-7,11)]):
                if target[axis]<low or target[axis]>high:
                    delta[axis]*=-1
                    angle=np.arctan2(delta[1],delta[0])
            xy=np.clip(xy+delta,[-10,-7],[10,11])
            interference=.8*interference+rng.normal(0,.45,len(anchors))
            samples=[]; signals=[]
            for idx,a in enumerate(anchors):
                distance=max(.3,float(np.linalg.norm(xy-[a['x_m'],a['y_m']])))
                rssi=float(a['rssi_1m_dbm']-10*a['expoente_perda']*np.log10(distance)
                           +interference[idx]+rng.normal(0,1.2)+(rng.normal(0,5) if rng.random()<.025 else 0))
                rssi=round(float(np.clip(rssi,-126,-1)),2)
                lost=rng.random()<.035
                signals.append(None if lost else rssi)
                if not lost: samples.append({**a,'rssi_dbm':rssi})
            estimate=None
            if len(samples)>=3:
                try: estimate=trilaterate(samples)
                except InvalidEvent: pass
            if estimate:
                last=estimate; age=0
            else: age+=6
            row=dict(origem='synthetic',sessao=session,passo=step,
                observado_em=(start+timedelta(days=session,seconds=step*6)).isoformat(),
                referencia_x_m=float(xy[0]),referencia_y_m=float(xy[1]),
                x_m=estimate['x_m'] if estimate else None,y_m=estimate['y_m'] if estimate else None,
                erro_residual_m=estimate['erro_residual_m'] if estimate else None,
                receptores_utilizados=len(samples),rssi=signals,idade_s=age,
                # Imputação causal apenas para entrada do modelo; mapa mantém lacuna explícita.
                features=[last['x_m'],last['y_m'],last['erro_residual_m'],len(samples),age] if last else None)
            rows.append(row)
    result=dict(origem='synthetic',execucao_id=str(uuid4()),propriedade_id=db.property_id,
                config=CONFIG,anchors=anchors,rows=rows)
    path.parent.mkdir(parents=True,exist_ok=True)
    save_json(path,result)
    save_json(path.with_suffix('.manifest.json'),dict(origem='synthetic',sha256=sha(path),
        execucao_id=result['execucao_id'],registros=len(rows),sessoes=sessions,config=CONFIG))
    print(json.dumps({'dataset':str(path),'registros':len(rows),'execucao_id':result['execucao_id']}))


def load_dataset(path):
    meta=json.loads(path.with_suffix('.manifest.json').read_text())
    if sha(path)!=meta['sha256']: raise ValueError('Hash do dataset incompatível')
    d=json.loads(path.read_text())
    if d['origem']!='synthetic' or any(r['origem']!='synthetic' for r in d['rows']):
        raise ValueError('Origem inválida')
    return d


def windows(d):
    groups={}
    for r in d['rows']: groups.setdefault(r['sessao'],[]).append(r)
    ids=sorted(groups); cut=int(len(ids)*.7); cut2=int(len(ids)*.85)
    splits=[]
    for selected in (ids[:cut],ids[cut:cut2],ids[cut2:]):
        xs=[]; ys=[]; baseline=[]; velocity=[]; keys=[]
        for sid in selected:
            rows=sorted(groups[sid],key=lambda r:r['passo'])
            for end in range(9,len(rows)-5):
                history=rows[end-9:end+1]
                if any(r['features'] is None or r['idade_s']>12 for r in history):continue
                if rows[end]['x_m'] is None:continue
                x=np.array([r['features'] for r in history])
                xs.append(x); ys.append([rows[end+5]['referencia_x_m'],rows[end+5]['referencia_y_m']])
                baseline.append(x[-1,:2]); velocity.append(x[-1,:2]+(x[-1,:2]-x[-4,:2])*5/3)
                keys.append([sid,end])
        splits.append(tuple(np.asarray(a) for a in (xs,ys,baseline,velocity,keys)))
    return splits, [ids[:cut],ids[cut:cut2],ids[cut2:]]


def tensorflow():
    os.environ.setdefault('TF_ENABLE_ONEDNN_OPTS','0')
    import tensorflow as tf
    tf.config.set_visible_devices([],'GPU')
    tf.config.threading.set_inter_op_parallelism_threads(2)
    tf.config.threading.set_intra_op_parallelism_threads(4)
    tf.keras.utils.set_random_seed(CONFIG['seed'])
    tf.config.experimental.enable_op_determinism()
    return tf


def train(path, directory, epochs):
    if directory.exists() and any(directory.iterdir()): raise ValueError('Use diretório vazio para novo treino')
    d=load_dataset(path); splits,ids=windows(d)
    mean=splits[0][0].reshape(-1,5).mean(axis=0)
    scale=splits[0][0].reshape(-1,5).std(axis=0); scale[scale<1e-6]=1
    xs=[((s[0]-mean)/scale).astype('float32') for s in splits]
    # Aprende deslocamento residual em relação à última estimativa.
    targets=[((s[1]-s[2])/10).astype('float32') for s in splits]
    tf=tensorflow(); directory.mkdir(parents=True,exist_ok=True)
    model=tf.keras.Sequential([tf.keras.layers.Input((10,5)),tf.keras.layers.GRU(32),
        tf.keras.layers.Dropout(.1),tf.keras.layers.Dense(16,activation='relu'),tf.keras.layers.Dense(2)])
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=.001,clipnorm=1),loss='mse')
    started=time.perf_counter()
    history=model.fit(xs[0],targets[0],validation_data=(xs[1],targets[1]),epochs=epochs,
        batch_size=256,shuffle=True,verbose=2,callbacks=[
            tf.keras.callbacks.EarlyStopping(patience=7,restore_best_weights=True),
            tf.keras.callbacks.ReduceLROnPlateau(patience=3,factor=.5,min_lr=1e-5),
            tf.keras.callbacks.ModelCheckpoint(str(directory/'model.keras'),save_best_only=True)])
    model.save(directory/'model.keras')
    save_json(directory/'normalization.json',dict(mean=mean.tolist(),scale=scale.tolist(),target_scale=10,features=FEATURES))
    save_json(directory/'config.json',{**CONFIG,'epochs_requested':epochs,'split_sessions':ids,
        'examples':[len(s[0]) for s in splits],'tensorflow':tf.__version__})
    save_json(directory/'history.json',history.history)
    save_json(directory/'manifest.json',dict(model_version='posicao-demo-v2',origem='synthetic',approved=False,
        operational=False,dataset_sha256=sha(path),execucao_id=d['execucao_id'],
        train_seconds=time.perf_counter()-started,architecture='GRU(32), Dropout(0.1), Dense(16,relu), Dense(2)',
        parameters=model.count_params()))
    evaluate(path,directory,model)


def metrics(y,p):
    e=np.linalg.norm(y-p,axis=1)
    return {**regression_metrics(y,p),'erro_mediano_m':float(np.median(e)),'erro_p95_m':float(np.percentile(e,95))}


def predict(model,x,normal):
    z=((np.asarray(x)-normal['mean'])/normal['scale']).astype('float32')
    return np.asarray(model(z,training=False))*normal['target_scale']+np.asarray(x)[:,-1,:2]


def verify_model(directory):
    seal=json.loads((directory/'hashes.json').read_text())
    for name,value in seal.items():
        if sha(directory/name)!=value: raise ValueError('Artefato alterado: '+name)


def evaluate(path,directory,model=None):
    if model is None:
        verify_model(directory); tf=tensorflow(); model=tf.keras.models.load_model(directory/'model.keras')
    d=load_dataset(path)
    manifest=json.loads((directory/'manifest.json').read_text())
    if manifest['dataset_sha256']!=sha(path): raise ValueError('Dataset diferente do treinamento')
    s=windows(d)[0][2]; normal=json.loads((directory/'normalization.json').read_text())
    output=np.concatenate([predict(model,s[0][i:i+256],normal) for i in range(0,len(s[0]),256)])
    predict(model,s[0][:1],normal)
    durations=[]
    for _ in range(50):
        start=time.perf_counter(); predict(model,s[0][:1],normal); durations.append((time.perf_counter()-start)*1000)
    report=dict(gru=metrics(s[1],output),persistencia=metrics(s[1],s[2]),velocidade_constante=metrics(s[1],s[3]),
        inferencia_media_ms=float(np.mean(durations)),inferencias=50,origem='synthetic',amostras=len(output))
    report['supera_persistencia']=report['gru']['rmse_m']<report['persistencia']['rmse_m']
    save_json(directory/'metrics.json',report)
    sid=int(s[4][0,0]); rows=[r for r in d['rows'] if r['sessao']==sid]
    predictions={int(key[1]):dict(proximo_x_m=float(p[0]),proximo_y_m=float(p[1]),horizonte_s=30)
                 for key,p in zip(s[4],output) if int(key[0])==sid}
    replay=dict(origem='synthetic',modelo='posicao-demo-v2',sessao=sid,metrics=report,
        anchors=d['anchors'],frames=[{**r,'previsao':predictions.get(r['passo'])} for r in rows])
    reference_file=directory/'reference.json'
    if reference_file.exists():
        replay['anchors']=json.loads(reference_file.read_text())
    else:
        devices=Database.environment().rows('dispositivos',select='id,codigo',order='id')
        codes={r['id']:r['codigo'] for r in devices}
        replay['anchors']=[{**a,'codigo':codes.get(a['receptor_id'],'Receptor')} for a in d['anchors']]
        save_json(reference_file,replay['anchors'])
    save_json(directory/'replay.json',replay)
    save_json(directory/'example.json',dict(origem='synthetic',input=s[0][0].tolist(),
        proximo_x_m=float(output[0,0]),proximo_y_m=float(output[0,1]),horizonte_s=30))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axis=plt.subplots(figsize=(8,4),layout='constrained')
    names=['gru','persistencia','velocidade_constante']
    bars=axis.bar(['GRU v2','Persistência','Velocidade constante'],
        [report[n]['erro_euclidiano_medio_m'] for n in names],color=['#ed7c16','#4b311f','#168a78'])
    axis.bar_label(bars,fmt='%.3f m');axis.set_ylim(0,10)
    axis.set(ylabel='Erro euclidiano médio (m)',title=f'Teste synthetic · {len(output)} janelas de {len(set(s[4][:,0]))} sessões')
    fig.savefig(directory/'comparison.svg');plt.close(fig)
    history=json.loads((directory/'history.json').read_text())
    fig,axes=plt.subplots(1,2,figsize=(11,4),layout='constrained')
    axes[0].plot(history['loss'],label='Treino');axes[0].plot(history['val_loss'],label='Validação')
    axes[0].set(xlabel='Época (índice)',ylabel='MSE do deslocamento / 10 m',title='Aprendizado');axes[0].legend()
    part=s[4][:,0]==sid
    axes[1].plot(s[1][part,0],s[1][part,1],label='Referência futura',color='#168a78')
    axes[1].plot(output[part,0],output[part,1],label='Previsão GRU',alpha=.7,color='#ed7c16')
    axes[1].set(xlabel='X (m)',ylabel='Y (m)',title=f'Sessão de teste {sid} · synthetic');axes[1].legend()
    fig.savefig(directory/'training-trajectory.png',dpi=160);plt.close(fig)
    save_json(directory/'hashes.json',{p.name:sha(p) for p in directory.iterdir() if p.is_file() and p.name!='hashes.json'})
    print(json.dumps(report,indent=2))


def populate(path):
    d=load_dataset(path); db=Database.environment()
    if db.property_id!=d['propriedade_id']: raise ValueError('Propriedade diferente')
    run=d['execucao_id']; UUID(run)
    manifest={k:v for k,v in d.items() if k!='rows'}; manifest['dataset_sha256']=sha(path)
    existing=db.request('GET','argos_demo_execucoes',{'id':'eq.'+run,'select':'manifesto'})
    if existing and existing[0]['manifesto'].get('dataset_sha256')!=sha(path):
        raise ValueError('Execução já existe com outro dataset; não será alterada')
    # ignore-duplicates torna repetição após timeout segura; jamais altera outro run.
    db.request('POST','argos_demo_execucoes',{'on_conflict':'id'},dict(id=run,propriedade_id=db.property_id,
        origem='synthetic',manifesto=manifest),'resolution=ignore-duplicates,return=minimal')
    for i in range(0,len(d['rows']),500):
        batch=[dict(execucao_id=run,propriedade_id=db.property_id,sessao=r['sessao'],passo=r['passo'],
                    observado_em=r['observado_em'],origem='synthetic',dados=r) for r in d['rows'][i:i+500]]
        for attempt in range(3):
            try:
                db.request('POST','argos_demo_medicoes',{'on_conflict':'execucao_id,sessao,passo'},batch,
                    'resolution=ignore-duplicates,return=minimal'); break
            except Exception:
                if attempt==2: raise
                time.sleep(2**attempt)
        if i%5000==0: print(f'Inseridos/verificados: {min(i+500,len(d["rows"]))}',flush=True)
    count=len(db.rows('argos_demo_medicoes',execucao_id='eq.'+run,select='sessao,passo',order='sessao,passo'))
    if count!=len(d['rows']):raise ValueError('Contagem divergente')
    print(json.dumps({'execucao_id':run,'registros':count,'origem':'synthetic'}))


def configure_parser(parser):
    parser.add_argument('demo_command',choices=['generate','train','evaluate','infer','populate','clean'])
    parser.add_argument('--dataset',type=Path,default=DATA); parser.add_argument('--model',type=Path,default=MODEL)
    parser.add_argument('--epochs',type=int,default=35); parser.add_argument('--sessions',type=int,default=100)
    parser.add_argument('--length',type=int,default=600); parser.add_argument('--run-id')


def run(args):
    if args.demo_command=='generate':generate(args.dataset,args.sessions,args.length)
    elif args.demo_command=='train':train(args.dataset,args.model,args.epochs)
    elif args.demo_command=='evaluate':evaluate(args.dataset,args.model)
    elif args.demo_command=='populate':populate(args.dataset)
    elif args.demo_command=='clean':
        run=str(UUID(args.run_id)); db=Database.environment()
        db.request('DELETE','argos_demo_execucoes',{'id':'eq.'+run,'origem':'eq.synthetic'})
        print('Removida somente a execução '+run)
    else:
        verify_model(args.model); tf=tensorflow(); model=tf.keras.models.load_model(args.model/'model.keras')
        example=json.loads((args.model/'example.json').read_text()); normal=json.loads((args.model/'normalization.json').read_text())
        out=predict(model,[example['input']],normal)[0]
        print(json.dumps(dict(origem='synthetic',horizonte_s=30,proximo_x_m=float(out[0]),proximo_y_m=float(out[1]))))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    configure_parser(parser)
    args=parser.parse_args()
    load_dotenv(ROOT/'ml/.env')
    run(args)


if __name__=='__main__':main()
