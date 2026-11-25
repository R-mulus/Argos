# Monitor Demo e GRU v2

Implementação local na `dev`, sem commit, push, PR ou merge. Migration
`20261125140317_argos_demo_v2.sql` aplicada no Supabase Argos. A v1 foi preservada.

## Iniciar no Windows

A venv existente foi verificada: **Python 3.12.10 e TensorFlow 2.20.0**.
O monitor sozinho não precisa de TensorFlow; apenas treino e inferência precisam.
Na raiz do repositório:

```powershell
# Reutiliza ml/.venv:
powershell -ExecutionPolicy Bypass -File scripts/monitor-demo.ps1 -Acao Instalar
# Se não existir: consulte py -0p e informe -PythonExe com o caminho compatível.
powershell -ExecutionPolicy Bypass -File scripts/monitor-demo.ps1 -Acao Monitor
Start-Process 'http://127.0.0.1:8765'
```

Também funciona com `INICIAR_MONITOR.bat`. Se a porta estiver ocupada, o terminal
informa a próxima disponível. Feche instâncias antigas antes de atualizar.
Configuração: `ml/.env` existente, somente no servidor: `SUPABASE_URL`, chave secreta,
`ARGOS_PROPERTY_ID`, `ARGOS_REFERENCE_VERSION`, `ARGOS_CALIBRATION_SHA256`.
Transmissor opcional: `ARGOS_MONITOR_TX_ID` (UUID); por padrão seleciona TX-0001.
Nunca servir `.env` nem expor a porta local na rede.

## Modo A — ESP32 reais

Fluxo: firmware → EMQX → `worker/` → Supabase → `ml/` → Supabase → monitor.
Não iniciar `iot/` nem o ingestor de `backend/` junto com os oficiais.
Em terminais separados:

```powershell
# Docker Desktop precisa estar funcional:
docker info
docker compose --env-file broker/.env -f broker/docker-compose.yml up -d --wait

# Terminal 1: ingestão
pnpm --dir worker build
pnpm --dir worker start

# Terminal 2: localização, com diretório correto dos artefatos legados
powershell -ExecutionPolicy Bypass -File scripts/monitor-demo.ps1 -Acao Worker

# Terminal 3: monitor
powershell -ExecutionPolicy Bypass -File scripts/monitor-demo.ps1 -Acao Monitor
```

RX-001 (-9,27; 0,03), RX-002 (6,73; -6,50), RX-003 (5; 10) m: coordenadas
confirmadas pelo usuário. O hash local estava desatualizado e impedia o worker de
iniciar. Foi alinhado com referencial `curral-demo-20261125`, mantendo origem
**experimental**, sem aprovar calibração física. A v1 mantém pesos e aprovação;
sua previsão é recusada quando o referencial difere. Medições anteriores à mudança
da geometria não são recalculadas com a nova geometria.

Polling HTTP a cada 1 s; uma consulta agregada ao Supabase por ciclo; exclusão de
consultas simultâneas; sequência monotônica; timeouts; reconexão; `no-store`;
retenção do último ponto válido; rejeição de horários inválidos/futuros, duplicatas,
regressões e saltos isolados. Nova observação na mesma coordenada atualiza evento
e horário. Leituras de cada RX têm horário próprio. Recebimento tardio não torna
a medição recente. Resíduo é qualidade do ajuste, **não margem de erro físico**.

A RPC é `security invoker`, acessível só a `service_role` no servidor. Nenhuma
tabela está publicada em Realtime: optou-se por polling sem habilitar infraestrutura
adicional. [Documentação Realtime](https://supabase.com/docs/guides/realtime/postgres-changes).

## Modo B — demonstração acadêmica

Selecione **B — Demonstração GRU · synthetic**. Use Reproduzir/Pausar, Reiniciar,
velocidade 1×/6×/12× e barra temporal. Replay da primeira sessão de teste, sem escrita
operacional. Previsões foram calculadas pelo modelo salvo durante `evaluate`, não
inventadas pelo navegador. Demonstre inferência manual com o comando abaixo.
Quadrado verde: referência sintética; círculo laranja: localização RSSI;
losango violeta: GRU +30 s. Pacotes insuficientes geram lacuna explícita no mapa.

Não há registro nem aprovação operacional. Ativar a demonstração significa selecionar
B; **não** alterar `ARGOS_MODEL_DIR` para a v2.

100 sessões × 600 passos = 60.000 medições; seed 20261125; intervalo 6 s;
repouso/caminhada persistentes; reflexão nas bordas; ruído correlacionado;
interferência e perda de pacotes de 3,5% por receptor. Limites verdadeiros:
X [-10,10], Y [-7,11] m. Estimativas RSSI podem extrapolar esses limites.

Entradas: X/Y estimados, resíduo, receptores e idade. Imputação causal do último
ponto por até 12 s somente na entrada da rede, nunca no mapa. Saída: deslocamento
residual convertido em `proximo_x_m` e `proximo_y_m`, 30 s à frente.
GRU(32) → Dropout(0,1) → Dense(16,relu) → Dense(2): **4.306 parâmetros**.
Normalização só no treino; Adam com clipnorm; EarlyStopping; checkpoint e redução
de learning rate. 70/15/15 sessões inteiras; 35 épocas, aproximadamente 21 s nesta CPU.
Nenhuma janela compartilhada entre conjuntos.

## Reproduzir

Dataset/modelo atuais já existem: geração e treino recusam sobrescrita.
Avaliar e inferir podem ser repetidos.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/monitor-demo.ps1 -Acao Gerar
powershell -ExecutionPolicy Bypass -File scripts/monitor-demo.ps1 -Acao Popular
powershell -ExecutionPolicy Bypass -File scripts/monitor-demo.ps1 -Acao Treinar
powershell -ExecutionPolicy Bypass -File scripts/monitor-demo.ps1 -Acao Avaliar
powershell -ExecutionPolicy Bypass -File scripts/monitor-demo.ps1 -Acao Inferir

# Novo experimento, sem sobrescrever:
$env:PYTHONPATH = 'ml'
.\ml\.venv\Scripts\python.exe -m argos_ml.cli --env ml/.env demo-v2 generate --dataset ml/data/outro.json
.\ml\.venv\Scripts\python.exe -m argos_ml.cli --env ml/.env demo-v2 train --dataset ml/data/outro.json --model ml/model/artifacts/outro --epochs 35
```

Dataset: `ml/data/demo-v2.json` (ignorado pelo Git, manifesto SHA-256 ao lado).
Artefatos: `ml/model/artifacts/posicao-demo-v2/`: modelo, manifesto, configuração,
normalização, histórico, métricas/baselines, referência, replay, exemplo e hashes.
Figuras: `comparison.svg` e `training-trajectory.png`.
Avaliação recarregada reproduziu exatamente os erros. Inferência individual:
14,6–30,5 ms nos ensaios, conforme carga da CPU; média final em `metrics.json`.
[Documentação GRU](https://keras.io/api/layers/recurrent_layers/gru/).

| Modelo | MAE m | RMSE m | Euclidiano médio m | Mediana m | P95 m |
|---|---:|---:|---:|---:|---:|
| GRU v2 | 2,025 | 2,604 | 3,182 | 2,871 | 6,628 |
| Persistência | 3,250 | 4,196 | 5,115 | 4,817 | 10,302 |
| Velocidade constante | 4,928 | 6,778 | 7,841 | 6,537 | 18,362 |

7.763 janelas de teste; referência futura sintética conhecida. RMSE 37,94% menor
que persistência neste gerador. **Não equivale a precisão em animais reais.**
Exemplo reproduzido: (-4,334375; -2,737159) m, horizonte 30 s.

## Banco: isolamento e limpeza

Execução: `81d6ddb5-7be2-4b4f-9b29-6a6dee019798`. 60.000 registros `synthetic`,
de 01/01/2026 00:00:00 a 10/04/2026 00:59:54 UTC.
Tabelas `argos_demo_execucoes` e `argos_demo_medicoes`; FK composta por propriedade;
RLS habilitada; sem concessões a anon/authenticated. Ausência de policies é
intencional: acesso só pelo servidor privilegiado. Zero triggers IoT nessas tabelas.
Lotes de 500; retry limitado; chave idempotente; validação de hash/run.

```sql
select execucao_id, origem, count(*), min(observado_em), max(observado_em)
from public.argos_demo_medicoes group by execucao_id, origem;
select count(*) from public.deteccoes;
select count(*) from public.argos_localizacoes;
select count(*) from public.argos_iot_jobs;
```

Antes/depois da população: 2.556 detecções, 746 localizações e 969 jobs (inalterados).
Depois executamos o worker sobre os 91 jobs pendentes antigos: todos classificados
como receptores calibrados insuficientes. Nenhuma posição fictícia foi gerada.
Nenhuma detecção/localização real foi excluída ou reescrita pela população.

Limpeza opcional, só da execução explícita (**não executada sobre o dataset**; cascade e isolamento validados em transação com rollback por `supabase/testes/demo_v2.sql`):

```powershell
$env:PYTHONPATH = 'ml'
.\ml\.venv\Scripts\python.exe -m argos_ml.cli --env ml/.env demo-v2 clean --run-id 81d6ddb5-7be2-4b4f-9b29-6a6dee019798
```

## Verificações e limites

```powershell
$env:PYTHONPATH = 'ml'
.\ml\.venv\Scripts\python.exe -m pytest monitor-demo/test_monitor.py ml/tests -q
.\ml\.venv\Scripts\python.exe -m pip install -r monitor-demo/requirements-test.txt
# Chrome instalado e monitor em 8765:
.\ml\.venv\Scripts\python.exe monitor-demo/verificar_monitor.py
pnpm --dir frontend build
pnpm --dir frontend lint
```

68 testes Python passaram; build e lint passaram (aviso preexistente de chunks grandes).
Chromium: desktop 1440 px e celular 390 px, sem overflow nem erro JavaScript.
Ensaio controlado: atualização, mesmo ponto/evento novo, rejeição de antigo, RSSI
individual, ausência de medição, erro e reconexão. Evidências locais em `evidencias/`.
Fonte substituta **somente no processo de teste**, nunca no servidor operacional.

Latência fonte controlada → exibição: cinco eventos, 999,6–1.983,4 ms,
média aproximada de 1,2 s. Snapshot real Supabase observado: 281–781 ms (incluindo consulta inicial).
**Não medimos persistência de nova localização física → navegador**: não havia
nova medição física e o Docker retornou `Docker Desktop is unable to start`.
`docker info` deve passar antes do ensaio MQTT. Após restabelecer Docker e ligar
placas, comparar `calculado_em` com a primeira exibição no console `[Argos exibição]`;
separar atraso medição → cálculo. Prazo alvo: até ~3 s após persistência com rede
saudável, ainda sujeito à confirmação física. Não esconder falhas com simulação.

## Roteiro para a banca

1. Abrir A: identificar RX; explicar metros locais, horários e resíduo.
2. Com placas/broker ativos, mover TX e mostrar evento/observação mudando. TX parado
   ainda gera eventos novos; desconexão deve envelhecer o dado explicitamente.
3. Selecionar B e anunciar que **todos os dados são synthetic**.
4. Reproduzir em 6×; apontar os três símbolos e o horizonte de 30 s.
5. Mostrar tabela/baselines e gráfico; executar `-Acao Inferir` para comprovar modelo salvo.
6. Explicar que superar baseline sintético não equivale a validação em campo.

## Arquivos e dependências

Monitor: `index.html`, `monitor.css`, `monitor.js`, `servidor.py`; Lucide 0.468.0
vendorizado com licença; Outfit já usada no projeto, servida localmente.
ML: `ml/argos_ml/demo_v2.py`, proteção temporal em `worker.py`, testes e requisitos demo.
Banco: migration `20261125140317_argos_demo_v2.sql`. Script: `scripts/monitor-demo.ps1`.
Novas dependências só na venv: Matplotlib para figuras, Playwright para testes.
Nenhum framework novo, alteração no frontend principal ou segredo no navegador.
