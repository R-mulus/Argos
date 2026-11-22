# Argos — localização RSSI e GRU em CPU

Subsistema independente da ingestão MQTT. Não altera ESP32, EMQX ou worker Node.
Trabalha em `backend-iot`; contratos de `origin/dev` foram consultados, não modificados.
Veja [auditoria](docs/AUDITORIA.md) e [integração](docs/INTEGRACAO.md).

## Instalação no Windows

Na raiz do repositório, use Python **3.12 de 64 bits**. O Python 3.14 instalado nesta máquina não foi usado para TensorFlow.

```powershell
py -3.12 -m venv ml/.venv
cd ml
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# Opcional para localização; necessário para treinar/inferir GRU:
.\.venv\Scripts\python.exe -m pip install -r requirements-ml.txt
Copy-Item .env.example .env
```

Alternativa com uv: `uv venv --python 3.12 ml/.venv`, seguido de
`uv pip install --python ml/.venv/Scripts/python.exe -r ml/requirements-ml.txt` na raiz.
Não é necessário Docker nem GPU. TensorFlow é importado apenas nos caminhos de IA.
Para reproduzir exatamente o ambiente Windows/Python 3.12 testado, use
`pip install -r requirements-windows-py312.lock.txt` dentro do ambiente virtual.
Os testes GRU são ignorados com justificativa quando TensorFlow não está instalado.

Preencha `.env` com `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `ARGOS_PROPERTY_ID`.
Também aceita `SUPABASE_SERVICE_ROLE_KEY` como alias para chave legada.
A mesma chave de backend do worker MQTT pode ser reutilizada; não a copie para frontend.
URL em Supabase → Integrations → Data API; chave em Settings → API Keys.
O processador usa HTTPS/PostgREST, portanto não precisa de senha PostgreSQL ou `DATABASE_URL`.
A propriedade é obrigatória e aplicada a toda consulta/gravação. O processo é administrativo;
não permita que usuários finais escolham essa variável através de uma API.

## Calibração e posição dos receptores

Meça três ou mais receptores no mesmo plano local (x,y), em metros, com origem e eixos documentados.
Não use coordenadas de exemplo nem misture plantas diferentes. Evite alinhamento dos receptores.
Cadastre pelo endpoint **existente em dev** `PUT /api/iot/receptores/coordenadas`, autenticado:

```json
{"receptor_id":"UUID_REAL","x_m":0,"y_m":0,"rssi_1m_dbm":-40,"expoente_perda":2}
```

Esse corpo ilustra campos, não recomenda valores. Substitua TODOS pelos valores medidos.
Nenhum exemplo é inserido automaticamente. A tabela é `argos_posicoes_receptores`.

Em cada receptor, registre várias amostras a 1 m e em outras distâncias conhecidas, cobrindo
orientações e condições do curral. Estime a referência a 1 m e ajuste
`RSSI = referência - 10*n*log10(distância)` por regressão sobre distâncias de referência.
Use mediana por distância na calibração para reduzir extremos, reserve medições para validação
e documente data/posição da antena. O código exige referência e expoente individuais;
não existe expoente universal. Vegetação, corpos, obstáculos, orientação e reflexão alteram RSSI.

O processador agrupa exatamente `(propriedade_id, transmissor_id, evento_id)` e rejeita duplicação
do mesmo receptor. Usa todos os receptores calibrados disponíveis, inicialização linear e
mínimos quadrados não lineares `soft_l1` (SciPy). A geometria exige razão entre valores singulares
≥ 0,01. Retorna RMS dos resíduos em metros, **não erro real nem porcentagem de precisão**.
Não interpola latitude/longitude; a integração geográfica exige referencial configurado em dev.

Vínculo é pesquisado por `inicio_em <= observado_em < fim_em`. Vínculos sobrepostos são rejeitados.
Sem timestamp ou vínculo conhecido a posição pode ser gravada com `animal_id=null`; não entra na GRU.
Não usa horário de chegada de uma fila offline como horário de movimento do animal.

## Executar localização

Primeiro, somente leitura:

```powershell
.\.venv\Scripts\python.exe -m argos_ml.cli audit
.\.venv\Scripts\python.exe -m argos_ml.cli worker --once
```

O segundo comando avalia até 50 jobs e informa se são localizáveis, sem gravar nem marcar jobs.
Como esses jobs não são marcados em modo somente leitura, repetir o comando encontra o mesmo lote.
Para avaliar eventos completos além dos primeiros 50, use o diagnóstico:

```powershell
$env:ARGOS_WRITE_ENABLED = '0'
.\.venv\Scripts\python.exe -m argos_ml.cli worker --once --min-receivers 3
```

Essa opção percorre todos os jobs pendentes já disponíveis, com paginação, e seleciona apenas
eventos com pelo menos N receptores distintos calibrados na mesma propriedade. N deve ser ≥3.
Exige `--once` e escrita desabilitada; não carrega GRU, não cria outbox, não grava nem altera jobs.
Não muda a seleção da fila normal. Imprime uma linha JSON por evento com IDs/códigos dos receptores,
RSSI, calibração, posição, resíduo RMS, avisos e motivo de rejeição, seguida de resumo.
O diagnóstico lê as detecções da propriedade em páginas para agrupá-las em memória; é um ensaio
pontual, não a estratégia do polling contínuo. Durante ingestão simultânea, o resultado é uma
fotografia aproximada das consultas; uma nova execução pode encontrar leituras adicionais.
As coordenadas genéricas de desenvolvimento não validam posições reais nem modelos de produção.
Veja [resultados do diagnóstico](docs/DIAGNOSTICO_JOBS.md).

Depois de conferir que a calibração é real, configure `ARGOS_WRITE_ENABLED=1` no `.env` e execute:

```powershell
.\.venv\Scripts\python.exe -m argos_ml.cli worker
```

Interrompa com Ctrl+C. Rode **uma instância por propriedade** e não execute simultaneamente o worker
Python legado de dev. A fila existente `argos_iot_jobs`, alimentada por trigger em `deteccoes`,
funciona como checkpoint persistente. O worker não varre indefinidamente o histórico.
Upsert usa o índice de evento existente; UUID determinístico e ACK condicional à versão do job
permitem retomar após falhas. Se outro receptor chegar, o trigger reabre o job. Leituras tardias
podem refinar a estimativa; o ACK de uma versão antiga não esconde o novo job.

Eventos sem três receptores/sem geometria ficam com estado explicativo. Após corrigir calibração,
reagende um intervalo limitado de chegada (o comando imprime contagem; escreve apenas com flag habilitada):

```powershell
.\.venv\Scripts\python.exe -m argos_ml.cli requeue --since '2026-11-21T00:00:00Z' --until '2026-11-22T00:00:00Z'
```

Também serve para eventos antigos anteriores ao trigger. Não apaga detecções. Não reprocessar
histórico com receptores reposicionados: o schema tem somente a calibração atual, não versões históricas.
Use um período compatível e invalide modelos se mudar o referencial.

Consultar resultado: rota existente `GET /api/iot/localizacoes?animal_id=UUID` ou tabela
`argos_localizacoes`, com cliente autenticado sujeito a RLS. Consultas administrativas ficam no backend.

## Dataset, treino e avaliação

```powershell
.\.venv\Scripts\python.exe -m argos_ml.cli prepare --since '2026-11-01T00:00:00Z' --until '2026-12-01T00:00:00Z' --out data/dataset.json
.\.venv\Scripts\python.exe -m argos_ml.cli train --dataset data/dataset.json --out model/artifacts/posicao-v1 --task position --steps 30 --interval-s 60 --horizon-s 300
.\.venv\Scripts\python.exe -m argos_ml.cli evaluate --model model/artifacts/posicao-v1
```

`prepare` exporta localizações e observações, sem alterar banco. Antes de um treino elegível para
produção, revise origem real, calibração, vínculos e referencial e exporte com `--reviewed-real-data`.
Dados não revisados são bloqueados para aprovação, assim como dados sintéticos. Essa confirmação
não transforma dados demonstrativos em reais: a revisão é responsabilidade de quem coleta.

Amostragem padrão: bins UTC de 60 s, última observação do bin; janela 30 amostras, horizonte 300 s.
Não há preenchimento de lacunas. Exige observações consecutivas em bins adjacentes. As coordenadas
do bin são uma medição dentro daquele minuto, não uma medição exata no início dele.
Atributos: x/y, deslocamento, velocidade, delta temporal, resíduo, número de receptores,
hora e dia da semana cíclicos. RSSI médio e zona não entram: não existem na tabela de localizações;
não inferimos a zona a partir de um receptor isolado.

Limites iniciais configuráveis em `SeriesConfig`: resíduo ≤15 m, velocidade ≤8 m/s,
lacuna máxima para KPI 120 s; são parâmetros de engenharia a validar no local, não resultados científicos.
Rejeita NaN/Inf, qualidade inválida e saltos. Segmenta por propriedade/animal/transmissor.
Cortes globais cronológicos 60/20/20 são feitos **antes** dos atributos e das janelas; não há
janela compartilhada entre splits. Scalers são ajustados só no treino e salvos em JSON no manifesto.

GRU(32) → Dense(16,relu) → Dense(2), Adam/MSE, EarlyStopping com restauração dos melhores pesos.
Alvo é a posição RSSI futura: MAE/RMSE medem previsão de estimativas, **não precisão GPS**.
Compara com persistência da última posição no mesmo teste. Treino é separado do worker.
Cada versão exige diretório vazio e salva `.keras`, manifesto, scalers, SHA256 e teste reservado.

```powershell
.\.venv\Scripts\python.exe -m argos_ml.cli approve --model model/artifacts/posicao-v1 --reviewer 'Responsavel pela validacao de campo'
```

Aprovação exige origem revisada, melhoria sobre baseline e pelo menos 30 janelas em cada split.
Esse mínimo é uma barreira operacional, não demonstra suficiência estatística; janelas dentro de um
split são correlacionadas. Revise generalização em outros dias/animais antes da aprovação.
Não aprove um modelo só porque passou o teste sintético. O manifesto inicial é `approved=false`.
Configure `ARGOS_MODEL_DIR=model/artifacts/posicao-v1` e reinicie o worker para carregar uma vez.
Inferência não ocorre com histórico insuficiente, mistura de animais, modelo não aprovado ou valores inválidos.

Inferência isolada, sem gravação: `python -m argos_ml.cli infer --model DIRETORIO --dataset HISTORICO_DE_UM_ANIMAL.json`.

## Comportamentos

Sem rótulos: disponibiliza somente `parado_aparente`, `em_movimento_aparente`, `indeterminado`.
Velocidade ≤0,1 m/s e deslocamento ≤3 m sugerem parado aparente; movimento exige ≥0,5 m/s e
deslocamento maior que piso de ruído + resíduos das duas posições. O resíduo é usado como
filtro heurístico conservador, não intervalo de confiança. Ausência de coleta é indisponibilidade.

Com rótulos: `argos_observacoes_visao`, classes exatas `parado`, `comendo`, `em_movimento`, `outro`.
Informe `--trusted-camera ID` no `prepare`, após revisar a proveniência. Exige confiança ≥0,8;
conflitos no mesmo bin são excluídos. Confiança de câmera isolada não prova rótulo correto.
Treine com `--task behavior`, em versão/diretório próprio. A arquitetura termina em Softmax(4),
loss cross-entropy e inclui matriz de confusão, métricas por classe e baseline classe majoritária.
O classificador prevê a classe no horizonte configurado, não percentual de tempo.
Configure `ARGOS_BEHAVIOR_MODEL_DIR` separadamente. Não se infere alimentação só por RSSI/cocho.

Distribuição temporal observada usa intervalos entre rótulos concordantes da mesma fonte,
no máximo 120 s, com cobertura explícita. Lacunas e transições não confirmadas ficam fora da cobertura.
Probabilidades futuras ficam nas predições e nunca são somadas como tempo observado.

## Persistência das previsões e compatibilidade

O banco real já tem `evento_id`, `observado_em`, `previsto_para`, `atual_x_m`, `atual_y_m`
e índice único `(propriedade_id,animal_id,evento_id,modelo_versao)`.
Mas exige comportamento/confiança/probabilidades NOT NULL. Previsão só de coordenadas precisa de
NULL nesses três campos. A [proposta SQL](sql/proposta_predicao_posicao.sql) é mínima, não destrutiva,
**não aplicada** e precisa de revisão/aprovação pelo responsável pelo banco.
O frontend também deve aceitar os campos nulos. Não se usa `outro=100%` como substituto.

Enquanto o schema não for compatível, previsões de posição ficam na outbox SQLite local e a
localização continua normalmente. Falhas temporárias de persistência também preservam a outbox;
após corrigir o banco, o worker tenta novamente. Não apague `data/state.sqlite`.
Classificação aprovada é semanticamente compatível com a tabela atual, com coordenadas futuras nulas.
Inferência que falha antes de gerar resultado é registrada; o próximo evento tenta novamente.

## KPIs e integração

`queries.animal_report` consulta cadastro, pesagens, localizações e rótulos; `queries.receivers_report`
consulta receptores e detecções. As funções são reutilizáveis, sem segundo servidor HTTP.
Contratos TypeScript e rotas propostas estão em [INTEGRACAO.md](docs/INTEGRACAO.md).

```powershell
.\.venv\Scripts\python.exe -m argos_ml.cli kpis --animal UUID_REAL --since '2026-11-21T00:00:00Z' --until '2026-11-22T00:00:00Z' --period dia --out data/kpis.json
```

`dia` usa buckets horários; `semana` e `mes`, diários no intervalo explícito [since,until).
Intervalos que cruzam buckets são repartidos proporcionalmente; datas/buckets usam UTC.
Distância é soma de deslocamentos aceitos, sujeita ao ruído RSSI. Velocidade é distância/cobertura,
não extrapolação do período inteiro. Intervalos sobrepostos de coleiras são rejeitados.
Sem cobertura, distância/velocidade retornam null, não zero. Nada é calculado a partir de pixels dos gráficos.

## Testes

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

Fixtures e modelos de teste ficam em diretórios temporários, não em produção. A suíte cobre
trilateração, ruído, geometria, identidades, vínculo temporal, escopo de propriedade, falhas HTTP,
ACK condicional, idempotência, outbox, janelas, splits/scalers, KPIs e treino/load/inferência de ambas as GRUs.
Auditoria real é somente leitura; teste de persistência usa repositório simulado, não altera produção.

## Diagnóstico

- `receptores_calibrados_insuficientes`: conferir o mesmo evento em três receptores e calibração na mesma propriedade.
- `geometria_degenerada`: medir/reposicionar receptores; não fabricar coordenadas.
- `horarios_incompativeis`: relógios divergem mais de 2 s para o mesmo beacon.
- `vinculo_historico_*`: conferir intervalos, não trocar pelo vínculo atual.
- `nao_aprovado`/histórico insuficiente: localização continua; coletar dados antes do treino.
- Falha de predicação/schema: preservar outbox e revisar proposta SQL; não preencher campos falsos.
- Jobs terminalizados precisam de `requeue` depois de corrigir configuração; novos beacons geram novos jobs.
- Após alterar modelos, reiniciar worker. Não há treinamento automático nem hot-reload.

Referências consultadas: [TensorFlow GRU](https://www.tensorflow.org/api_docs/python/tf/keras/layers/GRU),
[instalação TensorFlow](https://www.tensorflow.org/install/pip),
[Supabase Data API](https://supabase.com/docs/guides/api).
