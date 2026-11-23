# Arquitetura ML

23/11/2026: `academic_demo` exige autorização explícita, origem experimental e hash de calibração
compatível. `production` continua padrão e exige calibração validada. Datasets/modelos não são
promovidos entre modos. Modelo demo mantém approved=false e status demo_approved; worker em
produção o rejeita. Metadados públicos persistidos em argos_modelos_ml; Express usa apenas
Supabase/JWT, RPC e tabelas. Treino é comando separado; inferência é contínua após reinício do
worker configurado. Frontend e banco não iniciam processos IoT/ML. Outbox conserva origens incompatíveis.

Atualização 22/11/2026: banco é a fronteira obrigatória. Após persistência, KPIs são calculados
por `public.argos_ml_analise` SECURITY INVOKER e consumidos com JWT do usuário. API não executa
Python; frontend não calcula KPIs nem depende dos workers. Funções Python de KPI ficam como
ferramentas locais de diagnóstico/compatibilidade, sem participação no caminho da aplicação.
Proveniência por amostra e revisão de rótulos são migrations propostas sem backfill.
Decisão de ingestor oficial, avisos, limitações de locks e rollout: [ENTREGA_ML_SQL.md](ENTREGA_ML_SQL.md).

ESP-NOW/HMAC → receptor MQTT → worker Node existente → `deteccoes` → trigger `argos_iot_jobs` → Python RSSI → `argos_localizacoes` → dataset temporal/GRU → outbox local → `argos_predicoes` → API Express autenticada → painel React existente.

A localização não depende de TensorFlow. Treino é comando separado; só modelos aprovados entram no worker. Classificação depende de rótulos reais aceitos; KPIs observados não dependem de GRU. Coordenadas locais não são latitude/longitude.

Dados de produção são isolados por propriedade e animal. Chaves administrativas permanecem no Python; a API usa JWT e cliente do usuário com RLS. Experimentos são arquivos locais explicitamente identificados, nunca posições operacionais. Migrações são propostas revisáveis e não executadas automaticamente.

Limites atuais: REST não oferece transação entre upsert de posição e ACK; idempotência permite replay. Execução exige um worker por propriedade. Calibração e referencial mudados invalidam datasets/modelos; o schema legado não guarda versões históricas de calibração.
