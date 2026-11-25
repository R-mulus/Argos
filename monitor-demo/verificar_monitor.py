"""Ensaio Chromium: interface real e falhas controladas sem escrever no Supabase."""
import importlib.util
import json
import os
import threading
import time
from datetime import datetime,timezone,timedelta
from pathlib import Path
from unittest.mock import patch
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve().parent
OUT=HERE/'evidencias';OUT.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('monitor',HERE/'servidor.py')
m=importlib.util.module_from_spec(spec)
with patch.dict(os.environ):spec.loader.exec_module(m)


def fixture(event,x=2,offset=0):
    now=(datetime.now(timezone.utc)+timedelta(seconds=offset)).isoformat()
    p=dict(evento_id=event,x_m=x,y_m=3,observado_em=now,calculado_em=now,receptores_utilizados=3,erro_residual_m=.5)
    return dict(server_time=now,propriedade='Ensaio local SYNTHETIC',transmissor={'id':'tx','codigo':'TX-TESTE'},
        posicao=p,trilha=[p],rejeitados=[],evento_rssi=event,evento_posicao=event,calibracao_compativel=True,
        ultimo_pacote_em=now,ultima_medicao_em=now,fila={},dados_evento=3,
        receptores=[dict(codigo=f'RX-00{i+1}',x_m=i*5,y_m=i%2*10,rssi_dbm=-50-i*10,medido_em=now,
                        rssi_1m_dbm=-50,expoente_perda=2.6) for i in range(3)])


def main():
    report={};errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(bypass_csp=True,viewport={'width':1440,'height':1000})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8765');page.wait_for_function("document.querySelector('#telemetry').textContent.includes('Servidor conectado')")
        report['real_api']=page.locator('#telemetry').inner_text()
        page.screenshot(path=str(OUT/'real-desktop.png'),full_page=True)
        page.select_option('#mode','demo');page.wait_for_function("document.querySelector('#modelMetrics').textContent.includes('Teste synthetic')")
        page.locator('#timeline').fill('35');page.locator('#timeline').dispatch_event('input')
        assert 'GRU +30 s' in page.locator('#nodesLayer').text_content()
        page.click('#play');page.wait_for_timeout(1200)
        assert int(page.locator('#timeline').input_value())>35
        page.click('#play');page.screenshot(path=str(OUT/'demo-desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path=str(OUT/'demo-mobile.png'),full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        report['replay_e_mobile']='aprovados'

        # O mesmo LiveStore/HTTP/JS, com banco controlado em memória: nenhuma escrita operacional.
        current=[fixture('evt-1')];failure=[False]
        def read(_):
            if failure[0]:raise RuntimeError('Falha de rede controlada')
            return json.loads(json.dumps(current[0]))
        m.STORE=m.LiveStore()
        server=m.ThreadingHTTPServer(('127.0.0.1',0),m.Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        with patch.object(m,'build_snapshot',side_effect=read):
            page.goto(f'http://127.0.0.1:{server.server_port}')
            page.wait_for_function("document.querySelector('#telemetry').textContent.includes('localizado/exibido: evt-1')")
            delays=[]
            for i in range(2,7):
                current[0]=fixture('evt-'+str(i),2+i)
                start=time.perf_counter()
                page.wait_for_function("e=>document.querySelector('#telemetry').textContent.includes('localizado/exibido: '+e)",arg='evt-'+str(i),timeout=8000)
                delays.append((time.perf_counter()-start)*1000)
            current[0]=fixture('parado',8)
            page.wait_for_function("document.querySelector('#telemetry').textContent.includes('localizado/exibido: parado')")
            current[0]=fixture('antigo',1,-100)
            page.wait_for_timeout(2200)
            assert 'localizado/exibido: parado' in page.locator('#telemetry').inner_text()
            failure[0]=True
            page.wait_for_function("document.querySelector('#statusLabel').textContent.includes('indisponível')",timeout=8000)
            failure[0]=False;current[0]=fixture('recuperado',8)
            page.wait_for_function("document.querySelector('#telemetry').textContent.includes('localizado/exibido: recuperado')",timeout=8000)
            assert [r.inner_text().split(' dBm')[0] for r in page.locator('.rx-value').all()]==['-50','-60','-70']
            current[0]=fixture('recuperado',8,-100)
            page.wait_for_timeout(2300)
            assert 'TX sem medição recente' in page.locator('#telemetry').inner_text()
            report['latencia_local_fixture_ms']=delays
            report['falhas_ordem_reconexao_rssi']='aprovados'
        server.shutdown();browser.close()
    report['erros_javascript']=errors
    (OUT/'verificacao.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    assert not errors,errors
    print(json.dumps(report,indent=2,ensure_ascii=True))


if __name__=='__main__':main()
