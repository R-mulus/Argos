# Contrato do firmware e Supabase

Esquema conferido em 20/11/2026 por consulta somente leitura ao projeto Argos conectado,
além do `Schema_argos.txt` fornecido e migrations da referência `origin/dev`.
Nenhuma tabela, índice, política ou registro foi alterado.

## Rádio

Pacote ESP-NOW **v2**, 52 bytes, little-endian, compatível com a referência da `dev`:

| Offset | Campo | Tamanho |
|---|---|---|
| 0 | magic `0xA260BEE1` | 4 |
| 4 | version `2` | 1 |
| 5 | battery `0..100` ou `255` desconhecida | 1 |
| 6 | reserved `0` | 2 |
| 8 | transmissor UUID binário | 16 |
| 24 | boot nonce aleatório | 8 |
| 32 | sequence iniciando em 1 | 4 |
| 36 | primeiros 16 bytes HMAC-SHA256 sobre bytes 0..35 | 16 |

Segredo HMAC é a string UTF-8 configurada, sem decodificação hexadecimal.
Nonce permanece em RTC durante deep sleep; novo reset ou overflow de sequência cria novo nonce.
Evento: `UUID_TX:nonce_hex_16_digitos:sequencia_decimal`. Cópias de rádio e três receptores usam
o mesmo evento. O MAC não substitui o UUID. O código amigável não é transmitido.
Pacotes BLE dos anexos não são compatíveis; regrave os dois lados para usar ESP-NOW.

## MQTT

Tópico: `argos/v1/propriedades/<propriedade_uuid>/receptores/<receptor_uuid>/deteccoes`.
QoS 1; retain falso; Client ID `argos-rx-<receptor_uuid>`. UUIDs são normalizados para minúsculas.
JSON contém somente os seis campos do contrato v1. Exemplo **sintético**, não cadastro real:

```json
{
  "versao": 1,
  "evento_id": "12345678-1234-4234-9234-123456789abc:0123456789abcdef:42",
  "transmissor_id": "12345678-1234-4234-9234-123456789abc",
  "rssi_dbm": -65,
  "bateria_percentual": null,
  "detectado_em": null
}
```

Quando há NTP recente, `detectado_em` é UTC ISO 8601 no momento da recepção pelo RX, resolução
de segundos. Não é medição do relógio da coleira. Após ficar na fila, não é atualizado no reenvio.
O campo `recebido_no_gateway_em` existente no banco não é acrescentado ao JSON: isso quebraria
o parser v1 estrito de referência. A semântica desse campo deve ser mantida pelo worker.

## Mapeamento para o worker

| Campo de `public.deteccoes` | Origem/responsabilidade |
|---|---|
| `id` | UUID gerado pelo banco |
| `propriedade_id` | Tópico, validado contra cadastro do receptor |
| `receptor_id` | Tópico autorizado pela credencial do broker, validado em dispositivos |
| `transmissor_id` | Pacote autenticado, validado em dispositivos |
| `evento_id` | Evento estável do TX, preservado no reenvio |
| `rssi_dbm` | RX: inteiro de -127 a 0 |
| `bateria_percentual` | TX: 0..100 ou null; implementação atual sempre null |
| `detectado_em` | Captura no RX com relógio confiável ou null |
| `recebido_em` | Horário de recebimento/persistência definido pelo worker/banco |
| `recebido_no_gateway_em` | Primeira recepção na ingestão conforme contrato do worker; não inventar hora de captura |
| `vinculo_id` | Resolver por intervalo histórico em `vinculos`; null quando horário não permite |
| `zona_id` | Resolver somente com evidência temporal suficiente; caso contrário null |

O worker deve verificar tipo, status ativo e mesma propriedade para TX/RX, sem cadastro automático.
`deteccoes` não possui `animal_id`: o vínculo histórico leva ao animal.
Índice real confirmado: `deteccoes_evento_por_receptor_uk`, único em **(receptor_id, evento_id)**.
Reenvio ao mesmo RX gera uma detecção; três RXs podem gerar três detecções do mesmo evento.
Não usar deduplicação global apenas por `evento_id`.

O worker independente agora está implementado em `worker`, seguindo esse mapeamento.
Consulte [operação do worker](../../worker/README.md). Trilateração, TensorFlow e frontend
não fazem parte dessa implementação.
