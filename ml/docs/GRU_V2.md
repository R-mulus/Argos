# GRU v2 — integração ao módulo ML

A partir da pasta `ml/`, use o mesmo CLI das demais funções:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-demo.txt
.\.venv\Scripts\python.exe -m argos_ml.cli demo-v2 --help
.\.venv\Scripts\python.exe -m argos_ml.cli demo-v2 infer
.\.venv\Scripts\python.exe -m argos_ml.cli demo-v2 evaluate
```

Para uma instalação nova, execute `generate`, depois `populate` e `train` nesse
mesmo subcomando. Geração e treino recusam sobrescrever os dados/modelo existentes.
`populate` só escreve nas tabelas isoladas de demonstração; não o execute para
ativar o monitor. O comando antigo `python -m argos_ml.demo_v2` continua compatível.

| Conteúdo | Caminho relativo a ml/ |
|---|---|
| Implementação | `argos_ml/demo_v2.py` |
| CLI integrado | `argos_ml/cli.py`, subcomando `demo-v2` |
| Dataset e manifesto | `data/demo-v2.json`, `data/demo-v2.manifest.json` |
| Pesos, hashes, métricas e replay | `model/artifacts/posicao-demo-v2/` |
| Dependências adicionais | `requirements-demo.txt` |
| Testes | `tests/test_demo_v2.py` |

Os caminhos padrão independem do diretório de execução. A opção global `--env`
segue o CLI existente: fora de `ml/`, informe `--env ml/.env` antes de `demo-v2`
e defina `$env:PYTHONPATH = 'ml'`. Caminhos explícitos em `--dataset` e `--model`
são relativos à pasta de execução, como nos demais comandos do projeto.

O Monitor Demo independente serve o replay de `ml/model/artifacts/posicao-demo-v2/`,
verificando o hash. `scripts/monitor-demo.ps1` entra em `ml/` antes de chamar o CLI.
Não há mais uma pasta `model/` paralela na raiz do repositório. O `.gitignore`
preserva a política dos modelos legados e permite versionar só o artefato sintético v2.

Os 12 artefatos foram movidos sem regravar seu conteúdo; pesos, hashes e métricas
foram preservados. A v1 não foi modificada. A v2 continua exclusivamente `synthetic`,
sem aprovação operacional e sem alterar `ARGOS_MODEL_DIR`.

Veja [resultados, comandos completos e roteiro para a banca](../../monitor-demo/OPERACAO_V2.md).
