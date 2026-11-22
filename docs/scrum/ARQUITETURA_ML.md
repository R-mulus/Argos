# Arquitetura ML

ESP-NOW/HMAC → receptor MQTT → worker Node existente → `deteccoes` → trigger `argos_iot_jobs` → Python RSSI → `argos_localizacoes` → dataset temporal/GRU → outbox local → `argos_predicoes` → API Express autenticada → painel React existente.

A localização não depende de TensorFlow. Treino é comando separado; só modelos aprovados entram no worker. Classificação depende de rótulos reais aceitos; KPIs observados não dependem de GRU. Coordenadas locais não são latitude/longitude.

Dados de produção são isolados por propriedade e animal. Chaves administrativas permanecem no Python; a API usa JWT e cliente do usuário com RLS. Experimentos são arquivos locais explicitamente identificados, nunca posições operacionais. Migrações são propostas revisáveis e não executadas automaticamente.

Limites atuais: REST não oferece transação entre upsert de posição e ACK; idempotência permite replay. Execução exige um worker por propriedade. Calibração e referencial mudados invalidam datasets/modelos; o schema legado não guarda versões históricas de calibração.
