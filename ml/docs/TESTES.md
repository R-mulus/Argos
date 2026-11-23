# Verificação da etapa 2

Ambiente: Windows, Python 3.12.16 isolado em `ml/.venv`, TensorFlow 2.20.0 em CPU.
Dependências diretas fixadas; snapshot completo do ambiente em `requirements-windows-py312.lock.txt`.

## Suíte automatizada

Comando a partir de `ml`: `.\.venv\Scripts\python.exe -m pytest tests -q`.
Resultado final: **32 testes passaram**, incluindo TensorFlow (nenhum skip), em 7,33 s na última execução.
Houve 14 avisos de depreciação da interação Keras/NumPy, sem falhas; não foram ocultados.
A suíte usa fixtures locais e temporários
em `.pytest-tmp` (apagável, ignorado no Git), nunca credenciais ou banco de produção.

As duas GRUs foram efetivamente treinadas por duas épocas no teste sintético:

| Modelo | Parâmetros | Janelas treino | Validação | Teste |
|---|---:|---:|---:|---:|
| Posição GRU(32) + Dense(16) + Dense(2) | 4.978 | 355 | 115 | 115 |
| Comportamento GRU(32) + Dense(16) + Softmax(4) | 5.012 | 355 | 115 | 115 |

Essa execução usa janela de 4 amostras para rapidez e 600 posições sintéticas, não os dados reais.
Verifica shapes, finitude, scalers só de treino, salvamento/carregamento `.keras`, inferência,
normalização Softmax, isolamento de propriedade/animal, histórico insuficiente e rejeição de NaN.
Métricas numéricas dos testes ficam no manifesto temporário; não representam desempenho de campo.
Os artefatos permanecem sintéticos e não aprovados. Não há modelo de produção treinado.

Cobertura adicional:
- Posição conhecida recuperada a 1 mm no caso sintético sem ruído; **não é precisão em campo**.
- Ruído RSSI, receptores colineares, sinais/calibração inválidos, faltas/duplicatas e eventos misturados.
- Vínculo histórico, ambiguidade, ausência de relógio, calibração de outra propriedade.
- HTTP paginado com propriedade obrigatória, timeout com mensagem sanitizada, upsert idempotente simulado,
  falha de escrita sem ACK, ACK por versão de job, outbox preservada após reinício.
- Separação cronológica sem overlap entre splits, lacunas/outliers, intervalos sem dados,
  percentuais observados, cobertura, períodos dia/semana/mês e coleiras sobrepostas.

Não foi executado teste de escrita no Supabase de produção. Testes de persistência são isolados com
repositórios simulados/SQLite. Integração PostgreSQL real de escrita deve ocorrer em staging antes do rollout.

## Verificações reais, somente leitura

- MCP: columns, constraints, índices, RLS, trigger, contagens.
- Novo cliente Python/PostgREST: contagens conferem com MCP, acesso às tabelas existentes funciona.
- `worker --once` com escrita desabilitada: 50 jobs avaliados, sem coordenadas suficientes.
- Ensaio completo dos 103 eventos multirreceptor: rejeitados por geometria degenerada.
- Nenhum evento, rótulo, posição, predição ou migration foi gravado no banco.

## Dependências do campo e do colaborador

Corrigir coordenadas medidas no mesmo referencial; calibrar RSSI individualmente; comparar posição
estimada com referência real; coletar séries e rótulos com proveniência revisada.
Revisar proposta SQL de nulabilidade para regressão e adaptar campos nulos no contrato de dev.
Só então validar escrita em staging, aprovar modelo e habilitar inferência em produção.
