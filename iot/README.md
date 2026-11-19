# Previsão mensal por hábitos e EMQX

A implementação de hábitos por zona, sem trilateração, está em [HABITOS.md](../docs/iot/HABITOS.md). A conexão com EMQX Cloud/local está em [EMQX.md](../docs/iot/EMQX.md). As seções abaixo descrevem o pipeline anterior experimental de coordenadas e classificação.

# Backend IoT do Argos

Implementação derivada do MVP anexado: reutiliza a trilateração NumPy e evolui a GRU supervisionada. A base desta integração é `dev` em `8b241f5e5f8fae849336755988c048fcb1528e02`, não a `main` mais antiga. A API FastAPI/HTTP do anexo não deve rodar como segundo escritor de detecções: a ingestão canônica continua sendo o worker MQTT TypeScript do colaborador.

## Fluxo

```text
ESP32-C3 → ESP-NOW autenticado → 3+ receptores com coordenadas conhecidas
  → LittleFS → MQTT v1 QoS1 → worker TypeScript → SQLite → Supabase.deteccoes
  → trigger/job durável → Python: RSSI + GRU opcional → tabelas argos_*
  → Express autenticado + RLS → frontend
```

**Os receptores não descobrem suas próprias coordenadas por RSSI.** Meça suas posições em metros num mesmo referencial 2D, com pelo menos três não colineares. O serviço central calcula a posição do transmissor. Não pressupõe GPS, LoRa nem alcance de 120 m: ESP-NOW deve ser ensaiado no local, com as antenas reais.

A falta de internet mantém detecções no receptor e no SQLite do gateway. Nesta integração, **coordenadas e GRU são processadas após chegar ao PostgreSQL**; a visualização remota e o processamento não continuam ao vivo durante indisponibilidade do Supabase. Isso difere do modo FastAPI/SQLite independente do pacote original. NTP e broker locais permitem captar e enfileirar sem internet; perder a LAN/AP também pode perder beacons, pois não há confirmação fim a fim na transmissão broadcast.

## Instalação

1. Confira esquema real contra as migrações do repositório e faça backup. Aplique primeiro em staging `supabase/migrations/20261116000000_argos_iot_processamento.sql`, após as migrações anteriores. Não execute `Schema_argos.txt`: é apenas referência. A nova migração aceita as três tabelas `argos_*` do MVP já existentes e acrescenta colunas/índices. Duplicatas históricas fazem a criação do índice falhar explicitamente, sem apagar registros. A migração não importa dados de demonstração.
2. Mantenha a configuração existente de `backend/.env` e inicie `pnpm --dir backend mqtt:worker`, conforme `backend/README.md`. A fila SQLite deve ficar em disco persistente. Não compartilhe o mesmo arquivo com múltiplos processos.
3. Python 3.11/3.12, dentro de `iot/`:

```sh
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# Copie .env.example para .env e configure conexão interna ao PostgreSQL.
python -m argos_iot.worker
```

A URL Python usa `postgresql://`, pois a conexão agora é psycopg direta. Não usa URL HTTPS do Supabase nem `postgresql+psycopg://`. Use TLS e credencial interna de servidor com acesso às tabelas; não coloque credenciais no frontend/firmware. O processo não cria tabelas no startup. `SIGINT`/`SIGTERM` encerram entre trabalhos; jobs sobrevivem a reinícios. Para execução contínua, configure serviço com reinício automático no sistema operacional.

4. Cadastre dispositivos/animais/vínculos pelas rotas já existentes. UUIDs de exemplos do firmware devem ser conferidos antes de gravar. Cadastre coordenadas pela nova rota autenticada. Veja `../docs/iot/CONTRATOS.md`.
5. Configure firmware conforme `../firmware/LEIA_ME.md`. Primeiro valide uma leitura, depois três receptores e só então os modelos.

## Localização e recuperação

Um evento é `(propriedade_id, transmissor_id, evento_id)`. Cada receptor fornece uma medida; reenvios não aumentam o número de receptores. O processamento aguarda 2 s após a última inserção e é reagendado quando chega mais um receptor. Usa todos os receptores calibrados disponíveis. Posicionamento utiliza o modelo log-distância do MVP com mínimos quadrados ponderados, geometria condicionada e linha de busca. Rejeita NaN/Infinity, geometria quase colinear, evento misturado, ausência de horário, horários separados por mais de 2 s e vínculos divergentes.

`erro_residual_m` mede o ajuste das distâncias RSSI; **não é o erro real da posição**. Receptores extras ajudam, mas reflexões, corpo do animal, chuva, vegetação e potência/antena podem causar erro sistemático. Calibre `rssi_1m_dbm` e `expoente_perda` com distâncias conhecidas e compare MAE/p95 contra posições de referência. Recalibre após mover receptores/antenas. Não mova coordenadas enquanto houver backlog antigo: esta versão usa a calibração cadastrada no processamento, sem histórico de calibração.

A fila de jobs guarda estados `localizado`, `receptores_insuficientes`, `sem_horario`, `horarios_incompativeis`, `vinculo_incompativel`, `geometria_invalida`. Falhas transacionais recebem retry exponencial limitado a 300 s. Um receptor tardio reabre o job. Não há exclusão automática de histórico. Para reprocessar depois de corrigir cadastro, calibração ou carregar modelo, execute uma reabertura **limitada à propriedade/evento desejados**:

```sql
update public.argos_iot_jobs
set estado = 'pendente', disponivel_em = now(), tentativas = 0
where propriedade_id = 'UUID_PROPRIEDADE' and evento_id = 'EVENTO';
```

Eventos anteriores à migração não geram jobs retroativamente. Backfill explícito, com janela limitada:

```sql
insert into public.argos_iot_jobs(propriedade_id, transmissor_id, evento_id)
select distinct propriedade_id, transmissor_id, evento_id from public.deteccoes
where propriedade_id = 'UUID_PROPRIEDADE'
  and detectado_em >= '2026-11-16T00:00:00Z'
on conflict do nothing;
```

O worker registra erros sem imprimir connection strings. Consulte jobs pendentes/tentativas e logs. A IA opcional falhar não invalida a posição RSSI; para repetir inferências após corrigir o modelo, reabra os jobs explicitamente. Dimensione armazenamento/backup do broker, SQLite e PostgreSQL; as filas de servidor existentes não têm retenção automática nesta mudança.

## GRU

Instale `requirements-ml.txt` somente na máquina de treinamento/inferência. A GRU tem três saídas: posição atual refinada, posição no próximo intervalo e probabilidades de comportamento atual. Entradas: RSSI ordenado por UUID de receptor e coordenadas RSSI, em janelas regulares. O manifesto vincula um modelo a uma propriedade e geometria. Mais de três receptores são aceitos; o conjunto de features de um modelo treinado é fixo.

CSV de treinamento (um registro por animal/instante; acrescente uma coluna RSSI por receptor):

```text
propriedade_id,animal_id,timestamp,rssi_UUID_RX1,rssi_UUID_RX2,rssi_UUID_RX3,rssi_x_m,rssi_y_m,referencia_x_m,referencia_y_m,comportamento,fonte_referencia
```

`timestamp` tem fuso horário. `referencia_*` precisa de medição independente (`levantamento`, `camera_calibrada`, `gnss_referencia`); não copie trilateração para fingir ground truth. Comportamentos: parado, andando, correndo, alimentando, bebendo, deitado, outro. Uma posição/série de RSSI pode não distinguir alimentação de bebida: validação de rótulos e possivelmente sensores adicionais são necessários.

```sh
python -m argos_iot.train data/rotulos.csv --property UUID_PROPRIEDADE \
  --receivers UUID_RX1 UUID_RX2 UUID_RX3 --steps 16 --interval 30 --out model
```

A separação temporal 60/20/20 descarta janelas que cruzam cortes; normalização vem apenas do treino. Validação controla early stopping, teste reporta MAE em metros, baseline RSSI, baseline de persistência e acurácia comportamental. Quantidade mínima do script é apenas teste técnico, não suficiência estatística. Faça também avaliação por animal/dia/condições não vistos e examine classes desbalanceadas.

O manifesto nasce com `aprovado: false`. Antes de aprovação operacional, compare erro atual com RSSI e erro futuro com persistência em dados de campo; só marque `aprovado: true` após essa revisão. Configure `ARGOS_MODEL_DIR` e reinicie o processo; o modelo é carregado uma vez. Histórico insuficiente, outra propriedade, receptor ausente ou intervalo irregular devolve ausência de previsão. A posição RSSI permanece separada e consultável; inferência não a sobrescreve. Trocar geometria exige retreino/validação e nova versão. Não há modelo treinado para sua fazenda incluído nesta entrega.

## Verificação

```sh
python -m pip install pytest
python -m pytest -q
# Integração SQL opcional, SOMENTE em banco descartável com migrações aplicadas:
# ARGOS_TEST_DATABASE_URL=postgresql://... python -m pytest -q
```

Testes cobrem agrupamento, receptores extras, erro sintético conhecido, geometria, vínculo, horário, ausência de modelo, isolamento de features e partições temporais. `test_postgres.py` verifica jobs, atualização tardia, duplicatas e RLS em PostgreSQL real de teste. Ver registro de execução em `../docs/iot/VALIDACAO.md`.

## Auditoria de 19/11/2026

A configuração local PostgreSQL foi validada somente por leitura. A migração
IoT já está aplicada no Supabase; não reaplicá-la. Veja [operação](../docs/iot/OPERACAO.md)
e [auditoria](../docs/iot/AUDITORIA_2026-11-19.md).
O worker agora rejeita calibração posterior à captura (`calibracao_posterior`).
GRU exige `receiver_configuration` no manifesto e igualdade com a geometria e
calibração atuais; manifesto ausente/incompleto não gera previsões.
