# Executar o MVP acadêmico — Windows PowerShell

Entrega de 23/11/2026. Somente `backend-iot`; nenhuma migration operacional foi executada.
O frontend não participa da coleta, treino ou inferência. Não iniciar `backend/src/mqtt` nem `iot/`.

## Preparação e banco

Em cada terminal, use o checkout desta entrega (ou outro checkout **já** na backend-iot):

```powershell
$Repo = 'C:\Users\PICHAU\.codex\worktrees\argos-ml-sprint7\Argos'
Set-Location $Repo
if ((git branch --show-current).Trim() -ne 'backend-iot') { throw 'Use backend-iot' }
git status --short
pnpm install --frozen-lockfile
npm --prefix worker ci
py -3.12 -m venv ml/.venv
& ./ml/.venv/Scripts/python.exe -m pip install -r ml/requirements-ml.txt
```

Não recrie a venv se já existir. Modelos usam Python 3.12/TensorFlow 2.20 CPU.
Preserve arquivos privados e filas existentes. Se `.env` não existe, copie o `.env.example`
respectivo **somente nesse caso**, depois preencha localmente. Nunca sobrescreva credenciais:

```powershell
foreach ($dir in @('worker','ml','backend')) {
  if (!(Test-Path "$dir/.env")) { Copy-Item "$dir/.env.example" "$dir/.env" }
}
```

`worker/.env` e `ml/.env`: URL e chave de servidor Supabase. `ml/.env` também recebe
ARGOS_PROPERTY_ID com o UUID cadastrado. `backend/.env`: URL e chave publishable, nunca secret.
Localização das chaves: painel Supabase → Settings/API Keys; não imprimir ou versionar.

Antes da escrita, o responsável deve comparar histórico e DDL e autorizar a implantação em
ambiente de demonstração das migrations:

- `20261122235957_argos_ml_proveniencia.sql`
- `20261122235958_argos_ml_kpis.sql`
- `20261123142644_argos_ml_modelos.sql`

Aplicar primeiro em staging após revisão. Não há comando automático de deploy neste guia:
não executar todas as migrations antigas contra o projeto operacional. As anteriores são
pré-requisitos já existentes. A nova tabela de modelos contém apenas metadados públicos,
com RLS de propriedade. `origem=experimental` não é aprovação de produção.

Confirmar animal, vínculo histórico, três RX ativos, TX e coordenadas experimentais cadastrados.
Não alterar geometria durante a coleta: a mudança de hash interrompe escrita até nova revisão.

## Terminal 1 — broker

Com `broker/.env` e `broker/private/` já provisionados conforme `broker/README.md`:

```powershell
Set-Location $Repo
docker compose --env-file broker/.env -f broker/docker-compose.yml up -d --wait
docker compose --env-file broker/.env -f broker/docker-compose.yml ps
docker compose --env-file broker/.env -f broker/docker-compose.yml logs --tail 80 -f emqx
```

Use bind LAN apropriado, porta 1883 somente para a LAN de teste, dashboard em loopback.
Não executar `down -v`. Para parar preservando volumes, usar o mesmo comando Compose com `stop`.
Docker Desktop precisa estar funcional; nesta sessão houve erro 500 do daemon e os testes SQL
foram feitos no PostgreSQL embarcado, sem iniciar outro broker.

## Terminal 2 — ingestor oficial

```powershell
Set-Location "$Repo/worker"
npm run build
npm run check:database
npm run check:mqtt
npm start
```

Verifique logs `persistidas`, `reagendada`, `rejeitada` e estado da fila. Não rode o ingestor
alternativo do backend. Um processo por fila/client ID; locks não coordenam hosts diferentes.
Abra uma assinatura durável antes de ligar os transmissores. Em outro terminal, a leitura
da fila é não destrutiva:

```powershell
Set-Location "$Repo/worker"
npm run queue -- status
npm run queue -- rejected
```

Não apague `worker/data/ingestion.sqlite*`. Avisos da central são reenviados após falha com
idempotência. Mensagens inválidas sem identidade confiável ficam apenas no log.

## Arduino IDE

Abra `firmware/ArgosTransmissor/ArgosTransmissor.ino` ou `firmware/ArgosReceptor/ArgosReceptor.ino`.
Instale a biblioteca local `firmware/libraries/ArgosProtocol` e as dependências descritas no
README do firmware. Use a placa e porta físicas correspondentes; não assuma que COM10 continua igual.
Configure arquivos privados `ArgosSecrets.h` e `ArgosDevice.local.h` conforme os exemplos.
Cada receptor usa seu próprio UUID/código e credencial MQTT. Todos compartilham o segredo HMAC
do projeto com o transmissor. TX usa seu UUID cadastrado e vinculado ao animal.

O código versionado usa canal Wi-Fi **2**; faça TX, RX e roteador 2,4 GHz concordarem com o
canal escolhido. Ajuste conscientemente os dois ArgosConfig.h se necessário. Broker deve ser
o IP LAN do computador, não localhost. Modo LAN: ARGOS_LOCAL_PLAINTEXT=1, porta 1883.
O firmware transmite a cada 5 s e repete o mesmo beacon 3 vezes; repetições não são amostras novas.
Mantenha ARGOS_FORMAT_FLASH=0 em dispositivos com histórico. Troca de identidade com fila pendente
exige preservar/drenar sob a identidade original, não formatar para contornar o bloqueio.

Upload é manual pela IDE. Após upload, verificar Wi-Fi, MQTT autenticado, NTP, fila e contadores.
NTP tardio recupera no máximo cinco minutos e 64 leituras inéditas do mesmo boot. Registros
antigos continuam sem timestamp; não inventar horários para fazê-los entrar no treino.

## Terminal 3 — ML acadêmico

Primeiro somente leitura, dentro de `ml`:

```powershell
Set-Location "$Repo/ml"
$env:ARGOS_WRITE_ENABLED = '0'
./.venv/Scripts/python.exe -m argos_ml.cli reference
./.venv/Scripts/python.exe -m argos_ml.cli worker --once --min-receivers 3
```

Copie o `calibration_sha256` retornado para ARGOS_CALIBRATION_SHA256 no `.env`. Escolha e
documente uma versão de referencial, por exemplo `curral-demo-v1`. O hash identifica a
configuração real cadastrada; não certifica precisão física. No ambiente de demonstração
explicitamente autorizado, configure `ml/.env`:

```dotenv
ARGOS_EXECUTION_MODE=academic_demo
ARGOS_DEMO_AUTHORIZED=1
ARGOS_DATA_ORIGIN=experimental
ARGOS_CALIBRATION_VALIDATED=0
ARGOS_REFERENCE_VERSION=curral-demo-v1
ARGOS_CALIBRATION_SHA256=SUBSTITUIR_PELO_HASH_DO_COMANDO_REFERENCE
ARGOS_WRITE_ENABLED=1
ARGOS_STATE_PATH=data/academic-demo.sqlite
```

Esses valores são opt-in; o arquivo de exemplo mantém production e escrita desabilitada.
Somente após migrations e autorização do ambiente de demonstração:

```powershell
$env:ARGOS_WRITE_ENABLED = '1'
./.venv/Scripts/python.exe -m argos_ml.cli worker
```

O processo calcula posições com o RSSI recebido, grava origem/referencial/hash e confirma jobs
condicionalmente. Dados incompletos podem voltar à fila quando outro RX chegar. Modelos não
configurados não impedem trilateração. Não inicie outro processador Python para a mesma propriedade.
Não apague a outbox; falhas de rede/schema são preservadas. Para parar, Ctrl+C.

## Acompanhar as 24 horas

Em um terminal separado, em `ml`, use limites UTC reais da coleta:

```powershell
$fim = (Get-Date).ToUniversalTime().ToString('o')
$inicio = (Get-Date).ToUniversalTime().AddHours(-24).ToString('o')
./.venv/Scripts/python.exe -m argos_ml.cli collection-report --since $inicio --until $fim
```

O relatório é GET-only: detecções, eventos únicos, eventos com >=3 RX distintos, timestamps e
vínculos ausentes, posições, estados dos jobs, últimos horários e janelas elegíveis por referencial.
Jobs são fotografia de toda a propriedade; detecções são filtradas por chegada, posições por
observação. Falta de vínculo pode ser cadastro ausente, não defeito do rádio.
Logs `worker_metricas` mostram latência, resultados, outbox e modo de escrita. Acompanhe também
a fila Node, espaço em disco, logs MQTT e contadores do Monitor Serial. Frontend pode ficar desligado.

Consultas SQL **somente leitura**, com usuário autorizado/RLS, substituindo os UUIDs:

```sql
select estado,count(*) from public.argos_iot_jobs
where propriedade_id='UUID_DA_PROPRIEDADE' group by estado;
select count(*) from public.deteccoes where propriedade_id='UUID_DA_PROPRIEDADE';
select origem,count(*),max(observado_em) from public.argos_localizacoes
where propriedade_id='UUID_DA_PROPRIEDADE' group by origem;
select modelo_versao,origem,count(*),max(previsto_para) from public.argos_predicoes
where propriedade_id='UUID_DA_PROPRIEDADE' group by modelo_versao,origem;
```

`argos_iot_jobs` é interno: consultar no SQL Editor administrativo autorizado ou usar
collection-report; não conceder acesso ao frontend para contornar permissões.

## Dataset, treino, avaliação e aprovação experimental

24 h sem lacunas permitem no máximo 1440 bins de um minuto por animal/transmissor. Com passos
30 e horizonte 300 s, o teste ideal encontrou 829/253/253 janelas (treino/validação/teste).
Elas se sobrepõem dentro de cada split; não são 1335 observações independentes. Gaps e qualidade
podem reduzir esse número drasticamente. Confira collection-report antes de treinar.

Em `ml`, usando `$inicio` e `$fim` registrados para a coleta:

```powershell
./.venv/Scripts/python.exe -m argos_ml.cli prepare --since $inicio --until $fim --out data/coleta-24h-v1.json
./.venv/Scripts/python.exe -m argos_ml.cli train --dataset data/coleta-24h-v1.json --out model/artifacts/posicao-demo-v1 --task position --steps 30 --interval-s 60 --horizon-s 300 --epochs 50
./.venv/Scripts/python.exe -m argos_ml.cli evaluate --model model/artifacts/posicao-demo-v1
./.venv/Scripts/python.exe -m argos_ml.cli approve-demo --model model/artifacts/posicao-demo-v1 --reviewer 'Larapio'
```

Não usar `--reviewed-real-data` para a geometria experimental. Cada versão exige diretório novo.
Treino e avaliação são comandos separados, nunca executados por leitura ou requisição HTTP.
`approve-demo` exige modo autorizado, proveniência por amostra, referência/hash/propriedade
compatíveis com o ambiente, modelo e teste reservado íntegros, métricas reavaliadas, scalers e
inferência funcional. Mantém `approved=false`, `validated=false`, `approval_status=demo_approved`.
O comando `approve` continua exclusivo para produção. Sintéticos não são elegíveis ao modo demo.

Se a GRU perder para persistência, `improves_baseline=false` será mantido. É permitido demonstrar
esse resultado, sem chamar de melhoria. As métricas medem previsão das posições RSSI estimadas,
não erro de localização física. Os testes acadêmicos do repositório usam fixtures identificadas;
nenhum treino com coleta física de 24 h foi realizado nesta entrega.

## Ativar inferência contínua

No `ml/.env`, defina `ARGOS_MODEL_DIR=model/artifacts/posicao-demo-v1`. Mantenha
ARGOS_BEHAVIOR_MODEL_DIR vazio se não houver classificação revisada. Pare e reinicie o único
worker ML. Ele carrega o modelo uma vez, publica metadados em `argos_modelos_ml`, prevê sobre
histórico compatível e envia previsões pela outbox. Campos de comportamento permanecem nulos.
Metadados persistidos descrevem versões registradas, não comprovam que um processo está vivo.
Uma mudança de hash/referencial invalida o uso da versão antiga. Não compartilhe outbox entre
ambientes; registros de origem incompatível são preservados, sem promoção silenciosa.

## Terminal 4 — API Express

```powershell
Set-Location $Repo
pnpm --filter @argos/backend typecheck
pnpm --filter @argos/backend start
```

Em outro terminal, obtenha um access token da sessão Supabase Auth de um usuário autorizado
sem expô-lo em logs. Exemplo interativo (o texto não é impresso):

```powershell
$Token = Read-Host 'Access token da sessao' -MaskInput
$Animal = Read-Host 'UUID do animal'
$fim = (Get-Date).ToUniversalTime().ToString('o')
$inicio = (Get-Date).ToUniversalTime().AddHours(-24).ToString('o')
$headers = @{ Authorization = "Bearer $Token" }
$query = 'animal_id=' + $Animal + '&inicio=' + [uri]::EscapeDataString($inicio) + '&fim=' + [uri]::EscapeDataString($fim) + '&periodo=dia'
Invoke-RestMethod -Headers $headers -Uri ("http://localhost:3333/api/iot/analise?" + $query)
Remove-Variable Token,headers
```

`-MaskInput` exige PowerShell 7. No Windows PowerShell 5.1, obter token por variável segura
do ambiente do operador sem colá-lo em comando versionado. O contrato completo está em
`docs/integracao/CONTRATO_BACKEND_FRONTEND.md`. Não é necessário iniciar Python/MQTT para ler
histórico. Banco indisponível produz erro controlado, sem números fictícios de fallback.

## Testes isolados reproduzíveis

```powershell
Set-Location $Repo
npm --prefix worker run build
npm --prefix worker test
pnpm --filter @argos/backend typecheck
pnpm --filter @argos/backend test
New-Item -ItemType Directory -Force .build | Out-Null
$env:ARGOS_TEST_DEMO_EXPORT = Join-Path $Repo '.build/demo-gru-fixture.json'
Set-Location "$Repo/ml"
./.venv/Scripts/python.exe -m pytest tests -q
Set-Location $Repo
pnpm --dir supabase/testes --ignore-workspace install --frozen-lockfile
$env:ARGOS_TEST_PYTHON = Join-Path $Repo 'ml/.venv/Scripts/python.exe'
node --test supabase/testes/ml.test.mjs
./scripts/test-protocol.ps1
./scripts/compile-firmware.ps1 -ArduinoCli 'CAMINHO_DO_ARDUINO_CLI.exe'
```

Para o teste nativo, instalar Zig conforme a mensagem do script ou informar `-Zig` com caminho
existente. O Arduino CLI acompanha a Arduino IDE; use o executável instalado e dependências
descritas no README. Esses comandos compilam/testam; não fazem upload nem acessam produção.
