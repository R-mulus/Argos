# GRU de hábitos: horizonte diário de 30 dias

O alvo é a **proporção de observações por zona em cada um dos próximos 30 dias**, condicionada à coleta disponível. Não é distância, posição exata, tempo medido de permanência nem diagnóstico de alimentação/repouso. Sem rótulos de campo, não se deduz que estar no bebedouro significa beber. Dias são UTC, inclusive no contrato da API.

O novo módulo não usa trilateração, coordenadas ou as predições experimentais antigas. Consome detecções com horário, vínculo histórico e zona conhecidos. Para cada animal e intervalo de cinco minutos, considera a última observação e escolhe o RSSI mais forte na disputa de dois segundos, com desempate determinístico. Assim vários receptores não multiplicam o animal. Nenhuma zona é preenchida a partir do cadastro atual para eventos antigos.

Cada dia tem até 288 intervalos observados. Dias com menos de 144 intervalos válidos não entram em sequências. Ausência de dados não vira comportamento. As proporções referem-se à parcela observada e podem sofrer viés de cobertura dos receptores. Esse limiar é uma configuração experimental versionada no manifesto, não critério validado em campo.

## Operação

1. Aplique em staging, após as migrações anteriores, `supabase/migrations/20261116010000_argos_habitos.sql`. Há isolamento por propriedade (RLS), leitura autenticada e escrita somente pelo serviço.
2. Em `iot/`, com Python/dependências e `DATABASE_URL` configurados:

```sh
python -m argos_iot.habitos_worker --property UUID_PROPRIEDADE
```

Esse processo consolida os últimos sete dias completos a cada hora, inclusive sem modelo. `--once` executa um ciclo. A tabela `argos_habitos_diarios` preserva agregados além da retenção de telemetria bruta; ainda não há exclusão automática desses agregados. Execute desde o início da coleta. Eventos atrasados mais de sete dias não são incorporados automaticamente; backfill controlado pode chamar `consolidate(conn, propriedade, inicio, fim)` **apenas com dias brutos completos e ainda retidos**, para não substituir agregados com dados parciais. Não aplicar retenção menor que sete dias com esse worker.

3. Exporte para arquivo local ignorado pelo Git (crie `iot/data/`):

```sh
python -m argos_iot.habitos_worker --property UUID_PROPRIEDADE --export data/habitos.json
python -m pip install -r requirements-ml.txt
python -m argos_iot.habitos data/habitos.json --out model/habitos
```

O treinamento exige no mínimo técnico **300 dias** e sequências completas nas três partições. Isso não garante suficiência estatística. Os cortes cronológicos 60/20/20 são comuns a todos os animais; janelas de 30 dias de entrada + 30 de alvo que atravessam cortes são descartadas. O modelo GRU produz todos os 30 dias diretamente, sem realimentar previsões como observações reais. Entradas: proporções e calendário semanal. Não há dados simulados de treinamento incluídos.

4. Avalie `habitos.json`: MAE por horizonte contra persistência do último dia e repetição semanal. Faça avaliação por animal e período não vistos e examine mudanças de manejo e sazonalidade. `aprovado` nasce `false`. Marque `true` somente após validar em campo; configure `ARGOS_HABITOS_MODEL_DIR=model/habitos` e reinicie o worker. Alteração no conjunto de zonas exige retreino. O modelo é exclusivo de uma propriedade.
5. A inferência exige 30 dias completos consecutivos imediatamente anteriores ao dia atual. Sem modelo aprovado ou histórico suficiente, não grava previsões. Saídas não finitas/inválidas são rejeitadas. Upsert por propriedade/animal/data-base/versão evita duplicatas após reinício.

## Consulta

`GET /api/iot/habitos?animal_id=UUID&limit=20&offset=0`, autenticado pelo JWT Supabase, retorna `data`, `count`, paginação e `consultado_em`. Cada registro contém `observado_em` (último dia usado), `modelo_versao`, `criado_em` e `previsoes` com 30 objetos `{dia, proporcoes: {UUID_ZONA: fracao}}`. Histórico é mantido; o consumidor deve selecionar a data-base mais recente e sinalizar previsões antigas, sem chamar uma previsão de medição. Lista vazia significa **sem previsão disponível**, não rotina normal comprovada. Integração visual ainda não foi feita.

O treino e os testes sintéticos validam execução, não acurácia real. Sem meses de histórico, não há modelo mensal confiável disponível. A classificação antiga em `train.py`/`ml.py` permanece experimental e separada.
