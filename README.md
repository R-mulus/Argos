# Argos — aquisição IoT

Firmware, broker MQTT e worker independente, na branch `backend-iot`.

```text
ESP32 transmissor → ESP-NOW v2/HMAC → ESP32 receptor → MQTT v1/QoS 1 → broker → worker → Supabase
```

Implementados: transmissor/receptor genéricos, EMQX 6.3.2 autenticado e um único worker
Node.js 24/TypeScript. O receptor mantém fila em flash; o broker tem sessões duráveis;
o worker confirma MQTT somente após commit no SQLite e grava pequenos lotes no Supabase.
Não depende da API Express nem dos workers anteriores.

- [Configurar, compilar, gravar e diagnosticar](firmware/README.md)
- [Contrato MQTT e correspondência com o banco real](docs/firmware/CONTRATO.md)
- [Testes executados e roteiro com três receptores](docs/firmware/TESTES.md)
- [Broker, credenciais individuais, ACL e rede LAN/TLS](broker/README.md)
- [Worker: configuração, operação e regras de persistência](worker/README.md)
- [Resultados dos testes do backend IoT](docs/backend-iot/TESTES.md)
- [Etapa 2: localização RSSI, GRU, KPIs e integração com dev](ml/README.md)

## Iniciar no Windows

Requisitos: Node.js **24.x**, npm e Docker Desktop com engine Linux iniciado.
Na primeira instalação:

```powershell
cd worker
npm ci
# Usa a identidade/credenciais já configuradas do receptor, sem mostrar senhas:
npm run provision -- --from-firmware
node --import tsx scripts/setup-local.ts 'https://SEU_PROJETO.supabase.co'
```

Preencha **`SUPABASE_SECRET_KEY` em `worker/.env`** com uma Secret key do projeto
(ou `service_role` legado), obtida em Settings → API Keys no Supabase. Não coloque essa chave
no firmware nem no frontend. O provisionamento gera credenciais MQTT privadas em `broker/private`.
Se `.env` já existir, o setup preserva o arquivo; confira a URL e a chave nele.

```powershell
# Na raiz:
docker compose --env-file broker/.env -f broker/docker-compose.yml up -d --wait
cd worker
npm run check:mqtt
npm run check:database
npm run build
npm start
```

O broker inicia acessível só pelo computador (`127.0.0.1`). Para as placas, ajuste
`MQTT_BIND_HOST` em `broker/.env` para o IP da interface LAN e `ARGOS_MQTT_HOST`
no receptor para esse mesmo IP. Recrie o serviço com `docker compose ... up -d`.
Dashboard: [localhost:18083](http://localhost:18083), usuário `admin`, senha em `broker/.env`.
Inicie o worker e aguarde `mqtt_assinado` **antes** de ligar as coleiras.

O esquema real foi inspecionado somente para leitura. Não há migrations nem alterações de RLS.
`zona_id` permanece nulo porque a tabela atual não registra histórico receptor–zona.
Vínculo é resolvido pelo instante de captura; horário nulo mantém vínculo nulo.
Os testes de integração usam EMQX e worker reais com **API Supabase simulada**.
O fluxo com placas e gravação remota requer a chave/configuração e ensaio físico.

Dependências verificadas: core **esp32 by Espressif Systems 3.3.11**, ArduinoMqttClient **0.1.8**,
ArduinoJson **7.4.3**. A biblioteca `ArgosProtocol` está em `firmware/libraries`.
Os exemplos versionados vêm sem identidade ou credenciais: compilam, mas não operam até serem configurados.

Os sketches BLE anexados são referências de bancada; esta implementação usa o protocolo
ESP-NOW da `dev` (referência local `f804390aa6664400413e476db278f3075a1c0b18`).
Não altera frontend, tabelas, RLS, `dev`, `main` ou arquivos Arduino externos ao repositório.
