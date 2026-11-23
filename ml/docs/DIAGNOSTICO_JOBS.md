# Diagnóstico de eventos completos — 22/11/2026

## Causa confirmada no código

`Database.jobs()` busca somente 50 jobs pendentes disponíveis, ordenados por
`disponivel_em,transmissor_id,evento_id`. `worker --once` executa esse lote uma vez.
Com `ARGOS_WRITE_ENABLED=0`, nenhuma marcação avança a fila: a próxima chamada repete os mesmos
jobs. Eventos completos posteriores não chegam a ser avaliados nesse modo.
Isso não significa ausência de eventos completos nem falha do algoritmo de trilateração.

## Alteração mínima

- `cli.py`: opção `worker --once --min-receivers N`, com validação de N≥3 e escrita desabilitada.
- `worker.py`: encaminha exclusivamente essa opção para o diagnóstico, antes de carregar modelos/outbox.
- `diagnostics.py`: usa consultas GET paginadas, seleciona jobs pendentes já disponíveis e agrupa
  detecções por propriedade, transmissor e evento. Conta receptores distintos com calibração na
  mesma propriedade, independentemente da posição do job na fila.
- Reutiliza `localize()` sem alterar validações de duplicação, geometria, RSSI, vínculo ou horário.
- Cada linha `diagnostico_evento` contém evento/transmissor, receptores, RSSI, coordenadas de
  calibração, posição estimada, RMS e motivo de rejeição. Avisos identificam falta de tempo/animal.
- Não chama upsert, ACK ou inferência; nenhum registro ou schema de produção é alterado.

A fila normal continua com lote de 50, incluindo eventos incompletos. O filtro não é uma mudança
de prioridade de produção. O modo diagnóstico não exporta nem aprova datasets/modelos.

## Execução em PowerShell

Na pasta `ml`, com `.env` configurado:

```powershell
$env:ARGOS_WRITE_ENABLED = '0'
.\.venv\Scripts\python.exe -m argos_ml.cli worker --once --min-receivers 3
.\.venv\Scripts\python.exe -m pytest tests/test_diagnostics.py -q
.\.venv\Scripts\python.exe -m pytest tests -q
```

Com o ambiente virtual ativado, pode usar `python` em vez do caminho completo.
`--min-receivers 4` exige quatro receptores calibrados. Sem `--once`, com N<3 ou com escrita
habilitada, o comando falha explicitamente antes da conexão. Um resumo com zero selecionados
é válido: consultar disponibilidade do job, propriedade e calibração, sem modificar dados para forçar seleção.

## Resultado real, somente leitura

Com a configuração de desenvolvimento informada (RX-001=(0,0), RX-002=(10,0), RX-003=(5,10)):

| Resultado | Quantidade |
|---|---:|
| Jobs examinados | 208 |
| Abaixo de três receptores calibrados | 107 |
| Eventos selecionados | 101 |
| Trilaterações numericamente calculáveis | 101 |
| Gravações/alterações de jobs | 0 |

Resíduo RMS: mínimo **0,157652 m**, mediana **2,326867 m**, máximo **3,805845 m**.
Esses valores medem ajuste numérico às distâncias derivadas de RSSI, não precisão física.

Um exemplo com RSSI RX-001=-64, RX-002=-70, RX-003=-66 produziu
`x_m=3,999601`, `y_m=3,762359`, `erro_residual_m=1,862240`.
Esse evento tinha horário ausente em um receptor; o comportamento existente foi preservado:
calcula a geometria, mas retorna `animal_id=null` e `observado_em=null`.
No conjunto, **um evento** ficou sem tempo/animal e não serve para série temporal individual.

Os outros 100 eventos têm tempo e associação, mas as coordenadas são **fictícias**. Nem eles nem
os resíduos autorizam aprovação de um modelo de produção. Para dataset real, medir coordenadas,
calibrar RSSI, verificar sincronização e coletar posição de referência. Este comando não persiste
essas estimativas na tabela de localizações, portanto também não muda o dataset atual da GRU.

## Testes

Suíte completa: **45 testes passaram** em 7,41 s, incluindo as duas GRUs. Os 14 avisos
de depreciação Keras/NumPy já existentes continuam sem falhas. Nenhum teste altera produção.

Cobrem evento completo depois de 60 incompletos, contagem distinta, calibração de outra propriedade,
limiar configurável, rejeições por duplicata/geometria/horário/RSSI, ausência de horário, repetição
sem mutação, bloqueios do worker e manutenção do limite de 50 no caminho normal.
Modelos e outbox não são carregados pelo diagnóstico. Persistência não é usada nos testes de seleção.
