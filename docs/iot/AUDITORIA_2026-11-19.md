# Bancada RX-001 e TX-0001 — 19/11/2026

| Verificação | Evidência | Resultado operacional |
|---|---|---|
| Transporte | ArduinoMqttClient 0.1.8 atribui -2 quando `Client::connect` falha. O log da S3 mostra -2 em TCP local. | Falha anterior ao CONNECT MQTT. O firmware passou a identificar a etapa e limitar a abertura do transporte a dois segundos. |
| Autenticação | Mesmo notebook, mesmo endpoint LAN, mesmo usuário RX-001. O segredo MQTT do sketch recebeu CONNACK 4. O do CSV recebeu sucesso. | Cópia privada de bancada preparada com a credencial aceita. Cadastro do EMQX e arquivos privados originais preservados. |
| ESP-NOW | UUID do TX corresponde a TX-0001. As chaves dos dois cabeçalhos locais divergem. O log fornecido registra zero pacotes recebidos. | Receptor de bancada usa a chave existente do TX. A identidade HMAC dos binários já gravados depende de como foram compilados. |
| Windows | Wi-Fi do notebook em 192.168.18.14. `netsh advfirewall firewall show rule name=all verbose` mostra Argos EMQX MQTT LAN habilitada em todos os perfis, TCP/1883, origem 192.168.18.27. | A regra já foi atualizada. O teste no host não atravessa o ponto de acesso como o receptor. |
| Resets | O boot agora registra `esp_reset_reason()`. POWERON indica inicialização por energia. | Causa de reinicializações repetidas ainda requer captura física. Serial a 115200. |
| Fila | ESP-NOW copia pacote na fila FreeRTOS sem esperar. LittleFS preserva arquivo até `endMessage()` bem-sucedido. A biblioteca espera PUBACK no QoS 1. | Limites físicos permanecem em 256 elementos RAM e 512 arquivos. Queda de energia antes da gravação pode perder capturas RAM. |
| Banco | Auditoria encontrou 4.021 detecções, oito sem horário, zero duplicatas por receptor/evento, 50 vínculos. RX-001/002/003 pertencem aos Piquetes 1/2/3, R01 ao Curral 01, TX-0001 vinculado a A001. | Somente a correção de recência autorizada foi aplicada em produção. Coordenadas e cadastros preservados. |

## Gravação e comprovação física

1. No notebook desta bancada, abra na Arduino IDE `Documentos/Arduino/Argos-Bancada-RX001/ArgosReceptor/ArgosReceptor.ino`. Essa pasta contém credenciais reais e deve ficar privada. A cópia usa o HMAC do cabeçalho atual de TX-0001. Para garantir correspondência, grave o TX pelo sketch original com esse cabeçalho.
2. Para RX-001 selecione **ESP32S3 Dev Module**, core Espressif 3.3.11, biblioteca ArduinoMqttClient 0.1.8 e ArduinoJson 7.4.3. Selecione a porta identificada fisicamente e use **Upload**. Preserve a partição LittleFS e `ARGOS_FORMAT_FLASH=0`. Use Serial a 115200 e `ARGOS_LOG_LEVEL=4` para ver o ID de evento.
3. Com o worker já inscrito, confira autenticação do receptor, recepção ESP-NOW e PUBACK. Procure o mesmo evento em `public.deteccoes` por `(receptor_id, evento_id)`. Confira RSSI, captura, recebimento no gateway e no banco, vínculo e zona. Consulte o histórico da API com o JWT do proprietário. Esse encadeamento está pendente em hardware.
4. Se a S3 continuar com -2, capture TCP/1883 na interface Wi-Fi do Windows durante uma tentativa. Ausência de SYN pede investigação da rede do AP e isolamento de clientes. SYN chegando sem resposta pede inspeção de filtros e encaminhamento no host. SYN/ACK saindo sem ACK pede inspeção do caminho de retorno. Com a regra existente correta, alterações adicionais no firewall dependem dessa evidência.

Na auditoria inicial passaram 29 testes TypeScript, typecheck, build/lint frontend, 17 testes Python com PostgreSQL de teste (um teste TensorFlow ignorado), autenticação/ACL e reconexão EMQX e ensaio de fila offline com API simulada. Os dois sketches compilaram para ESP32 clássico, C3 e S3 nessa etapa. A nova compilação do receptor S3 inclui diagnóstico por etapa, timeout TCP e motivo de reset. Não foi observado evento físico novo até o Supabase. Consulte [operação](OPERACAO.md) e [registro da migração](PLANO_MIGRACAO_HORARIO.md).
