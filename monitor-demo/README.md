# Argos | Monitor ao Vivo — versão corrigida 1.1

Monitor independente e **somente leitura** da localização RSSI experimental no Supabase. Não intercepta MQTT, não grava no banco, não altera os workers, não simula movimentos.

## Como instalar e iniciar no Windows

1. **Feche o monitor antigo** (no PowerShell/Prompt onde ele está rodando, use `Ctrl+C`).
2. Extraia a pasta `monitor-demo` deste ZIP **para dentro da raiz do repositório Argos**, substituindo os arquivos antigos dessa pasta. Sua estrutura deve ser:

   ```text
   C:\Users\PICHAU\Documents\GitHub\Argos\
       ml\
           .env
           .venv\Scripts\python.exe
       monitor-demo\
           index.html
           servidor.py
           INICIAR_MONITOR.bat
           README.md
   ```

3. Deixe seus serviços habituais rodando: broker MQTT, Worker IoT e Worker ML. Se estiverem parados, o monitor pode abrir normalmente, mas não haverá novas posições.
4. Execute **`monitor-demo\INICIAR_MONITOR.bat`**, sem dar duplo clique em `index.html`.
5. O monitor abre automaticamente em `http://127.0.0.1:8765`. Se essa porta estiver ocupada, será usada a próxima porta disponível (8766, 8767...). Veja no terminal a URL exata.
6. Se o navegador mantiver uma página antiga em cache, pressione `Ctrl+F5`.

Alternativa via PowerShell, a partir da raiz do Argos:

```powershell
.\ml\.venv\Scripts\python.exe .\monitor-demo\servidor.py
```

## Se ainda não aparecerem dados

O painel **agora mostra o estado da consulta e os erros reais de configuração/banco** em vez de ficar no carregamento indefinidamente.

Abra o diagnóstico em outra aba, **na mesma porta informada pelo terminal**:

```text
http://127.0.0.1:8765/api/health
http://127.0.0.1:8765/api/live
```

Interpretação:

- **`configuracao_valida: false`** — o arquivo `ml/.env` não foi encontrado ou faltam `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`) ou `ARGOS_PROPERTY_ID`.
- **`estado: carregando`** — a consulta inicial ainda está em andamento; a resposta informa qual tabela está sendo consultada e há quantos segundos.
- **`estado: erro`** — erro do Supabase ou de configuração. A mensagem identifica a tabela e, quando possível, o motivo (ex.: coluna inexistente, permissão, conectividade).
- **`estado: ok`** — os dados foram carregados. Se não houver ponto no mapa, verifique os registros de receptores e `argos_localizacoes`, além do Worker ML.
- **`estado: desatualizado`** — a última consulta falhou, mas o painel conserva o último snapshot recebido para demonstração; ele mostra que a atualização falhou.

**Não compartilhe o `.env`, chaves, tokens ou URLs completas com credenciais.** É suficiente copiar a mensagem de erro de `/api/health` ou o texto da faixa vermelha do monitor.

Se usar o arquivo `.env` em outro local, é possível indicar o caminho por variável de ambiente `ARGOS_MONITOR_ENV_FILE`. A pasta padrão esperada é `Argos\ml\.env`.

## O que a banca verá

- Coordenadas X/Y calculadas pelo Argos usando RSSI, sempre identificadas como estimativas experimentais.
- Receptores RX-001/002/003 nas coordenadas físicas locais cadastradas.
- RSSI, dBm e medições de um **mesmo evento** (sem misturar horários ou dispositivos).
- Linha de trajetória apenas para medições temporalmente contínuas.
- Resíduo matemático do ajuste, data da última posição e idade do último pacote recebido.
- Alertas de posição desatualizada, falha de atualização e indisponibilidade.

**Ao vivo** significa que o navegador consulta o servidor local a cada 3 segundos e este lê os dados persistidos no Supabase. O posicionamento depende do processamento do Worker ML e não equivale a GPS. Sem novas medições, os números não se movem por simulação.

## Segurança

O servidor atende exclusivamente a `127.0.0.1`. Credenciais permanecem no Python local e são usadas somente para HTTP GET. O monitor não deve ser exposto para a rede local/internet. Não precisa abrir firewall ou atribuir IP fixo para o monitor.
