# Verificação do broker e worker — 20/11/2026

## Ambiente e resultados

- Node.js 24.18.0, TypeScript 5.9.3, MQTT.js 5.16.1 e Supabase JS 2.119.2.
- EMQX Enterprise 6.3.2, Docker Linux via Docker Desktop.
- `npm run build`: aprovado.
- `npm test`: 13 testes aprovados.
- `npm audit --omit=dev`: nenhuma vulnerabilidade reportada na execução.
- Compose base e overlay TLS: configuração validada.
- Broker operacional do Argos: healthcheck aprovado, autenticação e assinatura QoS 1 verificadas.

## Integração executada

`npm run test:integration` usa broker EMQX real, worker compilado real e SQLite em arquivo real.
Somente a API HTTP do Supabase é simulada. UUIDs e senhas de ensaio são sintéticos.

| Cenário | Evidência |
|---|---|
| Anônimo / senha incorreta | Conexões recusadas |
| Três receptores / mesmo evento | Três registros distintos na API simulada |
| Reenvio no mesmo receptor | Continua um único registro por RX/evento |
| Publicar por outro RX | Broker desconecta, nenhuma detecção extra |
| Publicação retida / QoS 0 | Broker desconecta |
| API do banco indisponível | Registro preservado no SQLite |
| Worker encerrado abruptamente | Fila recuperada após expiração do lock |
| Horário nulo após recuperação | Captura e vínculo continuam nulos |
| Worker offline e reinício do broker | Sessão e mensagem pendente recuperadas |

O teste cria um projeto Compose exclusivo `argos-iot-test-<pid>`, com portas 11883/28083,
e remove apenas os próprios containers/volumes ao terminar. Broker operacional usa 1883/18083
e volumes diferentes. Artefatos locais de ensaio ficam em `.build` e não são versionados.

## Testes unitários

Contrato exato do firmware, limites numéricos, JSON/UTF-8 inválido, tópico inválido, evento de
outro TX, sequência/nonce inválidos, data impossível/futura, configuração com chave pública,
papéis/status/propriedade, queries de vínculo `[inicio,fim)`, chave de conflito do upsert,
cache limitado, preservação do primeiro recebimento, reabertura da fila, backoff, quarentena,
capacidade/backpressure, lote de três RXs e isolamento de rejeição de constraint.

## Conferência remota e limites

Somente leitura no Supabase Argos: constraints/FKs/triggers e o receptor configurado no firmware
foram conferidos. O receptor consta como ativo, tipo receptor e propriedade correspondente.
Nenhum registro de teste foi gravado no banco remoto, nenhuma migration/RLS foi aplicada.

Permanecem dependentes do ambiente:

- `SUPABASE_SECRET_KEY` no arquivo local para executar `check:database` e ativar a ingestão real.
- Ensaio físico ESP-NOW → RX → IP LAN → EMQX → worker → Supabase.
- Handshake TLS com certificado real; o overlay foi validado, não foi provisionado certificado.
- Carga prolongada, desgaste da flash, queda física de energia e falha do disco/host Docker.

Não interpretar um teste com API simulada como confirmação de inserção no banco hospedado,
nem healthcheck local como prova de conectividade das placas.
