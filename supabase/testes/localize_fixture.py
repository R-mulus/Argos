"""Fixture sintética local; não importa Database, não acessa a rede nem carrega TensorFlow."""
import json
import math
import sys
from datetime import datetime, timezone, timedelta
from argos_ml.localization import localize

def uid(n): return f'00000000-0000-4000-8000-{n:012d}'
coords=[dict(receptor_id=uid(40+i),propriedade_id=uid(11),x_m=x,y_m=y,rssi_1m_dbm=-40,expoente_perda=2)
        for i,(x,y) in enumerate([(0,0),(100,0),(0,100)])]
links=[dict(id=uid(60),propriedade_id=uid(11),animal_id=uid(21),transmissor_id=uid(31),inicio_em='2026-10-01T00:00:00Z',fim_em=None)]
results=[]
for step in range(3):
    observed=(datetime(2026,11,1,tzinfo=timezone.utc)+timedelta(seconds=60*step)).isoformat()
    rows=[dict(propriedade_id=uid(11),transmissor_id=uid(31),evento_id=f'synthetic-{step}',
               receptor_id=c['receptor_id'],rssi_dbm=-40-20*math.log10(math.hypot(30+step-c['x_m'],40-c['y_m'])),
               detectado_em=observed,vinculo_id=uid(60)) for c in coords]
    results.append({**localize(rows,coords,links),'referencial_versao':'test-only','calibracao_sha256':'a'*64,'origem':'synthetic'})
assert 'tensorflow' not in sys.modules
print(json.dumps(results))
