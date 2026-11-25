
  (() => {
    "use strict";
    const el = id => document.getElementById(id);
    const ns = "http://www.w3.org/2000/svg";
    const svgnode = (tag, props = {}, txt) => { const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(props))n.setAttribute(k,String(v));if(txt!==undefined)n.textContent=String(txt);return n; };
    const clear = e => {while(e.firstChild)e.removeChild(e.firstChild)};
    const num = (v,d=2) => Number.isFinite(Number(v)) && v!==null && v!==undefined ? Number(v).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}) : "—";
    const time = iso => {const d=new Date(iso);return iso&&!isNaN(d.valueOf())?new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(d):"—";};
    const age = (stamp, now) => stamp ? Math.max(0, (now - Date.parse(stamp)) / 1000) : Infinity;
    const ageString = sec => !Number.isFinite(sec)?"Sem leitura":sec<3?"agora":sec<60?`${Math.round(sec)} s`:sec<3600?`${Math.floor(sec/60)} min`:sec<86400?`${Math.floor(sec/3600)} h`:`${Math.floor(sec/86400)} d`;
    const isNum = x => x!==null&&x!==undefined&&Number.isFinite(Number(x));
    let data=null, lastReceivedAt=0, fetching=false, showRings=false, offline=false, loadingMessage=null, lastError=null;
    const W=900,H=570;

    let mode='real',generation=0,replay=null,frame=0,playing=false,lastFrameAt=0;
    function drawDemo(){
      const f=replay.frames[frame],c=mapCoords(data.receptores,data.posicao,[]),layer=el('nodesLayer');
      const pts=replay.frames.slice(Math.max(0,frame-55),frame+1);
      el('trailsLayer').append(svgnode('polyline',{points:pts.map(p=>c.fx(p.referencia_x_m)+','+c.fy(p.referencia_y_m)).join(' '),fill:'none',stroke:'#168a78','stroke-width':2,'stroke-dasharray':'5 4'}));
      layer.append(svgnode('rect',{x:c.fx(f.referencia_x_m)-6,y:c.fy(f.referencia_y_m)-6,width:12,height:12,fill:'#168a78'}));
      if(f.previsao){let x=c.fx(f.previsao.proximo_x_m),y=c.fy(f.previsao.proximo_y_m);layer.append(svgnode('path',{d:`M${x} ${y-10}L${x+10} ${y}L${x} ${y+10}L${x-10} ${y}Z`,fill:'#7353aa'}));layer.append(svgnode('text',{x:x+12,y:y-12,fill:'#7353aa','font-size':13},'GRU +30 s'));}
    }
    function renderFrame(){
      if(!replay)return;
      const f=replay.frames[frame];el('timeline').value=frame;
      const position=f.x_m===null?null:{...f,evento_id:'synthetic-'+frame,calculado_em:f.observado_em,referencial_versao:'synthetic-v2'};
      render({server_time:f.observado_em,estado:'ok',propriedade:'Demonstração acadêmica · SYNTHETIC',transmissor:{codigo:'TX-VIRTUAL',nome:'Simulação · modelo não validado para operação'},posicao:position,
        trilha:replay.frames.slice(Math.max(0,frame-55),frame+1).filter(r=>r.x_m!==null),
        receptores:replay.anchors.map((r,i)=>({...r,codigo:r.codigo||'Receptor '+String(i+1),rssi_dbm:f.rssi[i],medido_em:f.observado_em})),ultimo_pacote_em:f.observado_em});
      el('modelMetrics').textContent='';
      const title=document.createElement('h2');title.textContent='Teste synthetic · GRU v2 vs. baselines';el('modelMetrics').append(title);
      const table=document.createElement('table');
      const head=document.createElement('tr');for(const label of ['Modelo','MAE (m)','RMSE (m)','Euclidiano (m)','Mediana (m)','P95 (m)']){let cell=document.createElement('th');cell.textContent=label;head.append(cell)}table.append(head);
      for(const key of ['gru','persistencia','velocidade_constante']){const tr=document.createElement('tr');for(const value of [key,...['mae_m','rmse_m','erro_euclidiano_medio_m','erro_mediano_m','erro_p95_m'].map(k=>num(replay.metrics[key][k],3))]){const td=document.createElement('td');td.textContent=value;tr.append(td)}table.append(tr)}
      el('modelMetrics').append(table);
      const note=document.createElement('p');note.textContent='Quadrado verde: referência simulada · círculo laranja: localização RSSI estimada · losango violeta: previsão GRU +30 s. Inferência CPU: '+num(replay.metrics.inferencia_media_ms,2)+' ms. '+(replay.metrics.supera_persistencia?'Superou persistência neste teste sintético.':'Não superou persistência neste teste.');el('modelMetrics').append(note);
    }
    el('mode').addEventListener('change',async()=>{
      mode=el('mode').value;generation++;data=null;playing=false;offline=false;el('play').textContent='Reproduzir';for(const n of ['gridLayer','ringsLayer','edgesLayer','trailsLayer','linesLayer','nodesLayer'])clear(el(n));const selected=generation;
      el('referenceLegend').hidden=mode!=='demo';el('predictionLegend').hidden=mode!=='demo';el('demoControls').hidden=mode!=='demo';el('modelMetrics').hidden=mode!=='demo';
      el('modeNote').textContent=mode==='demo'?'SYNTHETIC · transmissor virtual · previsões verificadas no replay · modelo sem validação operacional.':'ESP32 reais · posições experimentais · nenhuma previsão sintética operacional.';
      if(mode==='real'){poll();return}
      try{const response=await fetch('/api/demo',{cache:'no-store',signal:AbortSignal.timeout(8000)});const value=await response.json();if(selected!==generation)return;if(!response.ok)throw Error(value.erro);if(value.origem!=='synthetic')throw Error('Origem incompatível');replay=value;frame=0;el('timeline').max=replay.frames.length-1;renderFrame()}
      catch(e){if(selected!==generation)return;el('diagnostic').hidden=false;el('diagnostic').textContent=e.message;}
    });
    el('play').onclick=()=>{playing=!playing;lastFrameAt=Date.now();el('play').textContent=playing?'Pausar':'Reproduzir'};
    el('restart').onclick=()=>{frame=0;renderFrame()};
    el('timeline').oninput=()=>{frame=Number(el('timeline').value);renderFrame()};
    setInterval(()=>{if(mode==='demo' && playing && replay && Date.now()-lastFrameAt>=6000/Number(el('speed').value)){lastFrameAt=Date.now();if(frame<replay.frames.length-1){frame++;renderFrame()}else{playing=false;el('play').textContent='Reproduzir'}}},100);


    function currentServerMs(){return data ? Date.parse(data.server_time)+(Date.now()-lastReceivedAt) : Date.now()}
    function setStatus(label, kind){const box=el('statusPill');box.className='statuspill '+(kind==='live'?'':kind);el('statusLabel').textContent=label;el('mapLiveText').textContent=kind==='live'?'Posição recente':label;el('mapLiveDot').className='live-dot '+kind;el('mapShell').classList.toggle('busy',kind!=='live')}
    function refreshStatus(){
      if(offline){setStatus(data?'Atualização indisponível · último dado salvo':'Falha na conexão com Supabase','offline');return}
      if(!data){setStatus(loadingMessage || 'Conectando ao monitor...','stale');return}
      const now=currentServerMs(), pos=data.posicao;
      if(mode==='demo'){setStatus('SIMULAÇÃO synthetic · horizonte 30 s','stale');el('metricAge').textContent=data.posicao?'Instante da trajetória sintética':'Perda de pacotes · sem estimativa';el('txAge').textContent=data.posicao?'Passo atual':'Sem estimativa';el('lastPacket').textContent=time(data.ultimo_pacote_em)+' · synthetic';return}
      const packet=age(data.ultima_medicao_em,now), location=age(pos?.observado_em,now);
      if(!pos){setStatus(packet<25?'Recebendo RSSI · aguardando posição':'Aguardando localização','stale')}
      else if(location<=25){setStatus('LOCALIZAÇÃO AO VIVO','live')}
      else if(packet<=25){setStatus('RSSI chegando · posição aguardando','stale')}
      else{setStatus('Sem nova posição · último ponto salvo','stale')}
      el('metricAge').textContent=pos?'Observada há '+ageString(location):'Nenhuma posição experimental disponível';
      el('txAge').textContent=ageString(location);
      if(data.ultimo_pacote_em)el('lastPacket').textContent=time(data.ultimo_pacote_em)+' · há '+ageString(packet);
    }

    function signalBars(v){
      if(!isNum(v))return 0;
      return Math.max(1,Math.min(5,Math.round((Number(v)+100)/12)));
    }
    function estimatedRange(r){
      if(!isNum(r.rssi_dbm)||!isNum(r.rssi_1m_dbm)||!isNum(r.expoente_perda)||Number(r.expoente_perda)<=0)return null;
      const d=Math.pow(10,(Number(r.rssi_1m_dbm)-Number(r.rssi_dbm))/(10*Number(r.expoente_perda)));
      return d>0 && Number.isFinite(d)?d:null;
    }
    function renderRx(rx){
      const list=el('receiversList');clear(list);
      if(!rx.length){const p=document.createElement('div');p.className='rx-card';p.textContent='Nenhum receptor com coordenadas foi encontrado nesta propriedade.';list.append(p);return;}
      const recorded=rx.filter(x=>isNum(x.rssi_dbm)).length;
      el('rxTotal').textContent=recorded+' / '+rx.length;
      for(const r of rx){
        const card=document.createElement('div');card.className='rx-card';
        const top=document.createElement('div');top.className='rx-top';
        const ttl=document.createElement('div');ttl.className='rx-title';
        const ico=document.createElement('span');ico.className='rx-icon';ico.innerHTML='<i data-lucide="radio-tower"></i>';
        const label=document.createElement('span');label.textContent=r.codigo;ttl.append(ico,label);
        const state=document.createElement('span');state.className='reading-state '+(isNum(r.rssi_dbm)?'':'no');
        const dot=document.createElement('i');const st=document.createElement('span');st.textContent=age(r.medido_em,currentServerMs())<25?'Ativo · medição recente':isNum(r.rssi_dbm)?'Inativo · dado histórico':'Sem medição';state.classList.toggle('no',age(r.medido_em,currentServerMs())>=25);state.append(dot,st);top.append(ttl,state);
        const sub=document.createElement('div');sub.className='rx-sub';
        const value=document.createElement('div');value.className='rx-value';value.textContent=isNum(r.rssi_dbm)?num(r.rssi_dbm,0):'—';
        const unit=document.createElement('small');unit.textContent=' dBm';value.append(unit);
        const distance=document.createElement('div');distance.className='rx-distance';
        const range=estimatedRange(r);distance.textContent=range!==null?'Distância RSSI estimada\n≈ '+num(range,1)+' m':'Aguardando sinal';distance.style.whiteSpace='pre-line';sub.append(value,distance);
        const bars=document.createElement('div');bars.className='rx-bars';bars.setAttribute('aria-label','Nível relativo de sinal');
        for(let i=0;i<5;i++){const b=document.createElement('span');if(i<signalBars(r.rssi_dbm))b.className='on';bars.append(b)}
        const footer=document.createElement('div');footer.className='rx-foot';
        const pos=document.createElement('span');pos.textContent='Posição ('+num(r.x_m,2)+', '+num(r.y_m,2)+') m';
        const at=document.createElement('span');at.textContent=r.medido_em?'Leitura '+time(r.medido_em):'Sem medição';footer.append(pos,at);
        card.append(top,sub,bars,footer);list.append(card);
      }
    }

    function mapCoords(receivers,position,trail){
      const points=receivers.filter(r=>isNum(r.x_m)&&isNum(r.y_m)).map(r=>[Number(r.x_m),Number(r.y_m)]);
      if(position&&isNum(position.x_m)&&isNum(position.y_m))points.push([Number(position.x_m),Number(position.y_m)]);
      if(!points.length)return {scale:35,fx:x=>W/2+x*35,fy:y=>H/2-y*35,minX:-5,maxX:5,minY:-5,maxY:5};
      const loX=Math.min(...points.map(p=>p[0])),hiX=Math.max(...points.map(p=>p[0]));
      const loY=Math.min(...points.map(p=>p[1])),hiY=Math.max(...points.map(p=>p[1]));
      const centerX=(loX+hiX)/2,centerY=(loY+hiY)/2;
      const halfWidth=Math.max(6.7,(hiX-loX)/2+2.2),halfHeight=Math.max(6.7,(hiY-loY)/2+2.2);
      const scale=Math.min(750/(halfWidth*2),470/(halfHeight*2));
      return {scale,fx:x=>W/2+(x-centerX)*scale,fy:y=>H/2-(y-centerY)*scale,minX:centerX-halfWidth,maxX:centerX+halfWidth,minY:centerY-halfHeight,maxY:centerY+halfHeight};
    }

    function renderMap(){
      for(const n of ['gridLayer','ringsLayer','edgesLayer','trailsLayer','linesLayer','nodesLayer'])clear(el(n));
      if(!data)return;
      const rx=(data.receptores||[]).filter(r=>isNum(r.x_m)&&isNum(r.y_m));
      const pos=data.posicao && isNum(data.posicao.x_m)&&isNum(data.posicao.y_m)?data.posicao:null;
      const hasMap=rx.length>0||!!pos;
      el('emptyMap').hidden=hasMap;
      if(!hasMap){
        el('emptyMap').querySelector('strong').textContent='Aguardando medições';
        el('emptyMap').querySelector('p').textContent='Conexão ativa, mas não foram encontradas coordenadas dos receptores ou posições do transmissor. Confira a propriedade e os workers.';
        return;
      }
      const c=mapCoords(rx,pos,data.trilha||[]);const g=el('gridLayer');
      // Grid métrico real: sem coordenadas geográficas fictícias.
      for(let x=Math.ceil(c.minX/2)*2;x<=c.maxX;x+=2){let X=c.fx(x);g.append(svgnode('line',{x1:X,y1:44,x2:X,y2:531,stroke:'#e8e3dc','stroke-width':1}));g.append(svgnode('text',{x:X,y:545,'text-anchor':'middle','font-size':10,fill:'#a19a91'},x));}
      for(let y=Math.ceil(c.minY/2)*2;y<=c.maxY;y+=2){let Y=c.fy(y);g.append(svgnode('line',{x1:48,y1:Y,x2:853,y2:Y,stroke:'#e8e3dc','stroke-width':1}));g.append(svgnode('text',{x:32,y:Y+4,'text-anchor':'middle','font-size':10,fill:'#a19a91'},y));}
      g.append(svgnode('text',{x:849,y:551,'text-anchor':'end','font-size':10,'font-weight':700,fill:'#938579'},'X (m)'));
      g.append(svgnode('text',{x:28,y:36,'font-size':10,'font-weight':700,fill:'#938579'},'Y (m)'));
      if(rx.length>=3){const poly=rx.map(r=>c.fx(Number(r.x_m)).toFixed(1)+','+c.fy(Number(r.y_m)).toFixed(1)).join(' ');
        el('edgesLayer').append(svgnode('polygon',{points:poly,fill:'#e4c6a6','fill-opacity':'.17',stroke:'#a68262','stroke-opacity':'.6','stroke-width':1.7,'stroke-dasharray':'8 7'}));}
      if(showRings){for(const r of rx){const d=estimatedRange(r);if(d===null)continue;const radius=Math.min(1500,d*c.scale);const shape=svgnode('circle',{cx:c.fx(Number(r.x_m)),cy:c.fy(Number(r.y_m)),r:radius,fill:'#f58a18','fill-opacity':'.025',stroke:'#ed9e4b','stroke-opacity':'.55','stroke-width':1.6,'stroke-dasharray':'6 6'});el('ringsLayer').append(shape)}}
      // Só liga pontos do MESMO trecho contínuo. Nunca desenha salto entre dias.
      const raw=(data.trilha||[]).filter(p=>isNum(p.x_m)&&isNum(p.y_m)&&p.observado_em);
      if(raw.length){
        const current=raw[raw.length-1];let start=raw.length-1;
        while(start>0 && Date.parse(raw[start].observado_em)-Date.parse(raw[start-1].observado_em)<=90000 && Date.parse(raw[start].observado_em)-Date.parse(raw[start-1].observado_em)>0)start--;
        const contiguous=raw.slice(Math.max(start,raw.length-55));
        el('txTrail').textContent=contiguous.length+' posições';
        if(contiguous.length>1){el('trailsLayer').append(svgnode('polyline',{points:contiguous.map(p=>c.fx(Number(p.x_m)).toFixed(2)+','+c.fy(Number(p.y_m)).toFixed(2)).join(' '),fill:'none',stroke:'#e9a265','stroke-width':3.2,'stroke-linecap':'round','stroke-linejoin':'round','stroke-opacity':'.78'}));}
        contiguous.slice(0,-1).filter((_,i)=>i%2===0).forEach((p,i)=>{el('trailsLayer').append(svgnode('circle',{cx:c.fx(Number(p.x_m)),cy:c.fy(Number(p.y_m)),r:2.9,fill:'#e39a5d','fill-opacity':'.5'}));});
      }else el('txTrail').textContent='0 posições';
      if(pos){
        const px=c.fx(Number(pos.x_m)),py=c.fy(Number(pos.y_m));
        for(const r of rx.filter(x=>isNum(x.rssi_dbm)&&x.evento_id===data.evento_posicao&&data.evento_posicao)){const sx=c.fx(Number(r.x_m)),sy=c.fy(Number(r.y_m));
          el('linesLayer').append(svgnode('line',{x1:sx,y1:sy,x2:px,y2:py,stroke:'#bd9472','stroke-opacity':'.53','stroke-width':1.6,'stroke-dasharray':'5 8'}));}
      }
      rx.forEach(r=>{
        const x=c.fx(Number(r.x_m)),y=c.fy(Number(r.y_m));
        const group=svgnode('g',{});group.append(svgnode('circle',{cx:x,cy:y,r:25,fill:'#533826','fill-opacity':'.09'}));
        group.append(svgnode('circle',{cx:x,cy:y,r:17,fill:'#503422',stroke:'#fff','stroke-width':4}));
        group.append(svgnode('path',{d:`M${x-7} ${y+3} Q${x} ${y-5} ${x+7} ${y+3} M${x-4} ${y-1} Q${x} ${y-6} ${x+4} ${y-1}`,fill:'none',stroke:'white','stroke-width':1.6,'stroke-linecap':'round'}));
        group.append(svgnode('circle',{cx:x,cy:y+5,r:1.7,fill:'white'}));
        const labelWidth=Math.max(69,String(r.codigo).length*7.8+24),yy=y>360?y-47:y+29;
        group.append(svgnode('rect',{x:x-labelWidth/2,y:yy,width:labelWidth,height:24,rx:7,fill:'white',stroke:'#e5dcd1'}));
        group.append(svgnode('text',{x,y:yy+16,'text-anchor':'middle','font-size':12,'font-weight':750,fill:'#554232'},r.codigo));
        el('nodesLayer').append(group);
      });
      if(pos){const x=c.fx(Number(pos.x_m)),y=c.fy(Number(pos.y_m));const tx=svgnode('g',{});
        tx.append(svgnode('circle',{cx:x,cy:y,r:33,fill:'#f58a18','fill-opacity':'.17',class:'tx-dot-ring'}));
        tx.append(svgnode('circle',{cx:x,cy:y,r:24,fill:'#f58a18',filter:'url(#halo)','fill-opacity':'.3'}));
        tx.append(svgnode('circle',{cx:x,cy:y,r:18,fill:'#f58a18',stroke:'#fff','stroke-width':4}));
        tx.append(svgnode('path',{d:`M${x-8} ${y-3} Q${x} ${y-12} ${x+8} ${y-3} M${x-4} ${y+2}L${x} ${y+6}L${x+4} ${y+2} M${x} ${y+6}V${y+11}`,fill:'none',stroke:'white','stroke-width':2.2,'stroke-linecap':'round','stroke-linejoin':'round'}));
        tx.append(svgnode('rect',{x:x+20,y:y-34,width:112,height:30,rx:8,fill:'#f58a18'}));
        tx.append(svgnode('text',{x:x+32,y:y-14,'font-size':12,'font-weight':800,fill:'#fff'},data.transmissor?.codigo||'TX'));
        el('nodesLayer').append(tx);
      }
    }

    function render(d){
      if(mode==='real' && data && d.sequencia<data.sequencia)return;
      const firstDisplay=d.evento_posicao!==data?.evento_posicao;
      data=d;lastReceivedAt=Date.now();offline=d.estado==='desatualizado';
      lastError=d.erro_atualizacao||null;
      const diagnostic=el('diagnostic');
      diagnostic.hidden=!lastError;
      if(lastError)diagnostic.textContent='Falha ao atualizar o Supabase (mostrando última posição salva): '+lastError;
      el('propertyName').textContent=d.propriedade||'Propriedade';
      el('txCode').textContent=d.transmissor?.codigo||'Transmissor';
      el('txName').textContent=d.transmissor?.nome||'Dispositivo monitorado';
      const p=d.posicao;
      el('metricX').textContent=p?num(p.x_m):'—';el('metricY').textContent=p?num(p.y_m):'—';
      el('metricRx').textContent=p?String(p.receptores_utilizados??d.dados_evento??'—'):'—';
      el('rxDenominator').textContent='/ '+(d.receptores?.length||3);
      el('metricTime').textContent=p?time(p.observado_em):'—:—:—';
      el('txResidual').textContent=p&&isNum(p.erro_residual_m)?num(p.erro_residual_m)+' m':'—';
      el('txRef').textContent=p?.referencial_versao||'—';
      el('lastLocation').textContent=p?time(p.observado_em)+' · '+num(p.x_m)+' m / '+num(p.y_m)+' m':'Aguardando trilateração';
      renderRx(d.receptores||[]);renderMap();refreshStatus();lucide.createIcons();
      const ptime=Date.parse(p?.observado_em), calc=Date.parse(p?.calculado_em);
      const latency=Number.isFinite(calc)?(currentServerMs()-calc)/1000:null;
      el('telemetry').textContent=mode==='demo'?'synthetic · sessão '+replay.sessao+' · passo '+frame+' · referência conhecida, localização RSSI e previsão GRU distintas.'+(replay.frames[frame].previsao?' Previsão +30 s: X '+num(replay.frames[frame].previsao.proximo_x_m)+' m; Y '+num(replay.frames[frame].previsao.proximo_y_m)+' m.':' Sem previsão válida neste passo.'):
        'Servidor conectado · consulta '+num(d.consulta_ms,0)+' ms · sequência '+d.sequencia+
        ' · TX '+(age(d.ultima_medicao_em,currentServerMs())<25?'ativo':'sem medição recente')+
        ' · recebido: '+(d.evento_rssi||'nenhum')+' · localizado/exibido: '+(d.evento_posicao||'nenhum')+
        ' · fila pendente: '+(d.fila?.quantidade||0)+
        ' · medição → cálculo: '+(Number.isFinite(calc-ptime)?num((calc-ptime)/1000,2)+' s':'indisponível')+
        ' · cálculo → exibição agora: '+(latency!==null?num(latency,2)+' s':'indisponível')+
        (!d.calibracao_compativel?' · BLOQUEIO: calibração mudou; confira worker e configuração.':'')+
        (d.evento_rssi!==d.evento_posicao?' · Telemetria sem posição correspondente; confira fila e receptores.':'')+
        (d.rejeitados?.length?' · '+d.rejeitados.length+' posição(ões) rejeitada(s).':'');
      console.info('[Argos exibição]',{evento:d.evento_posicao,sequencia:d.sequencia,idade_s:age(p?.observado_em,currentServerMs()),consulta_ms:d.consulta_ms,primeira_exibicao:firstDisplay,observado_em:p?.observado_em,calculado_em:p?.calculado_em,exibido_em:new Date().toISOString(),calculo_ate_exibicao_ms:latency===null?null:latency*1000});
      if(mode==='demo')drawDemo();
    }

    async function poll(){
      if(fetching || mode!=='real')return;
      const requestGeneration=generation;
      fetching=true;
      const ctrl=new AbortController();const tid=setTimeout(()=>ctrl.abort(),8000);
      try{
        const response=await fetch('/api/live',{cache:'no-store',signal:ctrl.signal});
        let result;
        try{result=await response.json()}catch(_){throw new Error('Resposta inválida do servidor Python. Verifique o terminal.')}
        if(requestGeneration!==generation)return;
        if(!response.ok || result.estado==='erro')throw new Error(result.erro || 'HTTP '+response.status);
        if(result.estado==='carregando'){
          offline=false;loadingMessage='Consultando Supabase · '+(result.segundos||0)+' s';
          el('emptyMap').hidden=false;
          el('emptyMap').querySelector('strong').textContent=result.aviso||'Consultando Supabase';
          el('emptyMap').querySelector('p').textContent=(result.etapa||'Aguardando dados')+'. O monitor permanece responsivo durante a consulta.';
          refreshStatus();
          return;
        }
        if(result.estado!=='ok' && result.estado!=='desatualizado')throw new Error('Estado desconhecido na resposta do servidor.');
        loadingMessage=null;
        render(result);
      }catch(error){
        if(requestGeneration!==generation)return;
        offline=true;lastError=error?.message||'Erro desconhecido';
        const diag=el('diagnostic');diag.hidden=false;
        diag.textContent='Erro ao obter dados: '+lastError+' · Verifique o terminal e acesse /api/health para diagnóstico.';
        if(!data){
          el('emptyMap').hidden=false;
          el('emptyMap').querySelector('strong').textContent='Não foi possível carregar os dados';
          el('emptyMap').querySelector('p').textContent=lastError;
        }
        refreshStatus();
        console.error('[Argos Monitor]',lastError);
      }finally{clearTimeout(tid);fetching=false;}
    }
    window.addEventListener('error',event=>{
      offline=true;
      const diag=el('diagnostic');diag.hidden=false;
      diag.textContent='Erro na interface: '+(event.message||'erro inesperado')+'. Atualize com Ctrl+F5 e confira o console (F12).';
      refreshStatus();
    });
    el('ringsButton').addEventListener('click',()=>{showRings=!showRings;el('ringsButton').setAttribute('aria-pressed',String(showRings));renderMap()});
    el('refreshButton').addEventListener('click',poll);
    el('fullscreenButton').addEventListener('click',()=>{if(document.fullscreenElement){document.exitFullscreen?.()}else{document.documentElement.requestFullscreen?.()}});
    setInterval(poll,1000);setInterval(()=>{refreshStatus();if(data && mode==='real')renderRx(data.receptores||[]);},1000);poll();lucide.createIcons();
  })();
  
