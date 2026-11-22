# Contrato de integração com o backend do frontend

## Detecções: MQTT existente, sem mudança incompatível

Tópico ASCII, sem acento:
`argos/v1/propriedades/UUID_PROPRIEDADE/receptores/UUID_RECEPTOR/deteccoes`

```json
{"versao":1,"evento_id":"UUID_TX:NONCE64:SEQUENCIA","transmissor_id":"UUID_TX","rssi_dbm":-65,"bateria_percentual":null,"detectado_em":"2026-11-16T12:00:00Z"}
```

Use UUIDs válidos, QoS1 e `retain=false`. Repetições do mesmo beacon em todos os receptores compartilham `evento_id`; não gerar ID aleatório em cada receptor. O pacote ESP-NOW é v2 binário; o JSON MQTT continua v1. O broker deve restringir cada usuário ao tópico exato de seu receptor. HMAC protege o beacon com segredo por propriedade, mas não cifra o broadcast e não fornece relógio seguro contra replay de um evento ainda desconhecido. Dispositivos provisionados com mesmo segredo são uma mesma fronteira de confiança.

`detectado_em` é a hora da recepção no ESP32, não a hora do upload. Sem NTP válido será `null`; o backend preserva a detecção para diagnóstico sem atribuir vínculo/zona atuais. `recebido_no_gateway_em` continua registrando a chegada ao worker e `recebido_em` a chegada ao PostgreSQL. Bateria permanece nula até instalar/calibrar medição real.

## API Express nova

Todas as rotas exigem `Authorization: Bearer <JWT Supabase>` e a propriedade é obtida da sessão. Não usar token de dispositivo, service role ou credencial do banco no navegador.

| Método/rota | Uso |
|---|---|
| `PUT /api/iot/receptores/coordenadas` | `{receptor_id,x_m,y_m,rssi_1m_dbm,expoente_perda}`; receptor ativo da propriedade |
| `GET /api/iot/receptores/coordenadas` | Coordenadas/calibração cadastradas |
| `GET /api/iot/localizacoes?animal_id=UUID&limit=20&offset=0` | Histórico RSSI, mais novo por horário de observação primeiro |
| `GET /api/iot/predicoes?animal_id=UUID&limit=20&offset=0` | Posição atual GRU, futura, horário alvo e probabilidades |
| `GET /api/iot/localizacoes/recentes` | Até 5 estimativas por animal, com `recebido_em` (view `argos_localizacoes_recentes`); usada pelo mapa |
| `GET/PUT /api/iot/referencia-espacial` | Origem geográfica ou planta em metros da propriedade (ver `docs/MAPA.md`) |
| `GET /api/iot/zonas/geometrias`, `PUT/DELETE /api/iot/zonas/:id/geometria` | Contorno das zonas em metros locais |

Listagens retornam `{data,count,limit,offset,consultado_em}`. `limit` entre 1 e 100. `animal_id` opcional; sem filtro lista a propriedade. PUT retorna `{data}`. Tipos `LocalizacaoIoT` e `PredicaoIoT` disponíveis em `@argos/shared`. Posição em metros relativos à origem cadastrada, não latitude/longitude. Para posição atual de um animal, consulte `localizacoes?animal_id=...&limit=1`. Verifique `observado_em`; horário do processamento não renova dado antigo. Para casar GRU e RSSI, compare `animal_id` e `evento_id`; não unir simplesmente os primeiros registros de consultas diferentes.

## O que já popula os componentes

- Contagem reconciliada de animais/zonas: rota existente `/api/monitoramento/resumo`. Não somar detecções por receptor: um mesmo animal aparece em três ou mais.
- Estado dos receptores: `/api/monitoramento/receptores` existente; comprova comunicação por leituras, não heartbeat independente. Sem animais próximos, ausência de leitura não distingue rádio parado de receptor offline.
- Histórico RSSI: `/api/deteccoes`, exportação e filtros existentes.
- Coordenadas, trajetória e previsão: novas rotas `/api/iot/*`.
- Comportamento: `probabilidades` por animal/instante em `PredicaoIoT`. Agregações devem escolher uma previsão recente por animal, nunca somar todas as previsões históricas.
- Peso/cadastro/alertas: continuam responsabilidade das APIs existentes; RSSI não gera peso.

Temperatura, processamento de imagens, FLOPs, ONNX/A100 e tempo de processamento de imagens exibidos em componentes de demonstração **não são medições disponíveis dos ESP32/GRU desta entrega**. Manter como indisponíveis até adicionar as fontes respectivas. Não converter confiança individual da GRU em acurácia global. Métricas avaliadas do modelo estão em `metadata.json`; não há endpoint público de métricas de treinamento nesta etapa.

O frontend existente foi preservado; seu colaborador deve ligar os componentes novos a esses contratos e implementar estados vazios/desatualizados. As rotas atuais de monitoramento continuam sendo alimentadas pelo mesmo fluxo MQTT.
