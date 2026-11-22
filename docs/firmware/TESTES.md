# Verificação do firmware — 20/11/2026

Atualização: broker e worker foram implementados na etapa seguinte. Seus testes de integração
estão em [verificação do backend IoT](../backend-iot/TESTES.md). O relatório abaixo preserva a
distinção entre os testes originais do firmware e o ensaio físico ainda pendente.

## Evidência executada

Ambiente: Windows, Arduino CLI fornecido pela IDE, core Espressif 3.3.11,
ArduinoMqttClient 0.1.8, ArduinoJson 7.4.3. Identidades/segredos de operação não foram preenchidos.
Compilar com placeholders verifica os caminhos de código, mas o firmware para em CONFIG até provisionar.

| Verificação | Resultado |
|---|---|
| TX: ESP32 clássico, C3 e S3 | Compilação aprovada nos três alvos |
| RX: ESP32 clássico, C3 e S3, MQTT TCP | Compilação aprovada nos três alvos |
| RX: ESP32 clássico, MQTT TLS | Compilação aprovada, verificação de CA habilitada |
| Cabeçalho C++ de produção: UUID, HMAC e eventos | Aprovado no host |
| Pacote de 52 bytes / HMAC comparado a Python independente | Idêntico |
| Alteração individual de todos os 416 bits do pacote | Todas rejeitadas |
| 256 valores de bateria, versão, reserva, sequência/nonce zero, chave errada | Validações aprovadas |
| Classe C++ de fila: duplicação, capacidade, reinício, troca de identidade | Aprovada no host |
| Fila: rename/remoção com falha, temporário parcial, corrupção no horário | Recuperação/preservação/quarentena aprovadas no host |
| Esquema remoto Supabase | Consulta somente leitura confirmou colunas e índice único por RX/evento |

Os testes nativos executam o mesmo `ArgosProtocol.h` e `ArgosQueue.h` usados no firmware.
No host, a interface mbedTLS é adaptada ao HMAC-SHA256 do Windows BCrypt e LittleFS ao disco
Windows com injeção de falhas. Isso valida a lógica compartilhada; não é execução do driver LittleFS,
da pilha MQTT ou do rádio no ESP32. O adaptador troca ':' por '_' em nomes de arquivo porque
Windows e LittleFS possuem regras distintas de nomes.

Zig 0.13.0 foi instalado somente em `.tools/ziglang` (ignorado pelo Git). Durante a primeira
compilação nativa, o runtime do Zig emitiu avisos de atributos `dllexport`; os testes terminaram com código 0.

Para repetir:

```powershell
python -m pip install --target .tools/ziglang ziglang==0.13.0
./scripts/test-protocol.ps1
./scripts/compile-firmware.ps1 -ArduinoCli '<caminho-do-arduino-cli.exe>'
```

O segundo script compila também o ramo TLS usando definições de build, sem alterar os arquivos
de configuração de operação. Os binários/artefatos ficam em `.build`, fora do versionamento.
Os testes contêm UUID/chave sintéticos explicitamente públicos; não são credenciais para uso real.

## Não executado / não comprovado

- Gravação, transmissão ESP-NOW, recepção RSSI e consumo de energia nas placas físicas.
- Precisão de NTP, perda de rádio durante associação Wi-Fi, alcance e colisões com várias coleiras.
- Corte de energia durante escrita/rename na flash, desgaste e recuperação real do filesystem.
- Handshake TLS com certificado real, autenticação MQTT e ACL em um broker acessível às placas.
- Persistência de evento real no Supabase e recuperação do worker após indisponibilidade do banco.
- Testes A–H/J do prompt amplo envolvendo broker/worker: esses serviços não foram implementados
  nesta entrega focada no firmware. O teste I de compilação foi executado; ensaio físico segue pendente.

Nenhuma telemetria simulada foi inserida no banco real. Nenhuma placa foi gravada automaticamente.

## Ensaio com um TX e três RXs

1. Escolha quatro registros existentes da mesma propriedade, tipos/status corretos. Configure cada
   identidade e use a mesma chave HMAC por propriedade. Fixe o AP e os sketches no mesmo canal.
2. Configure três credenciais MQTT distintas com ACL no tópico exato de cada RX. Configure o worker
   independente conforme [contrato](CONTRATO.md), com fila durável e validação do cadastro.
3. Provisione a flash dos receptores conforme [guia](../../firmware/README.md), depois desative
   a formatação. Grave primeiro um RX, verifique IP/canal/MQTT no Serial a 115200, depois grave o TX.
4. Confirme que cada ciclo do TX gera o evento `UUID:nonce:sequencia` e que as três cópias preservam
   esse valor. Um `radio=1` significa conclusão de transmissão no rádio; não confirma RX/banco.
5. Com conta de diagnóstico autorizada, assine o filtro `argos/v1/propriedades/+/receptores/+/deteccoes`.
   Verifique os seis campos, RSSI válido, bateria null e horário UTC/null conforme NTP.
6. Ligue RX-002/RX-003. Um único evento deve produzir até três tópicos distintos com o mesmo
   `evento_id`. A contagem de animais não é a soma das leituras. Falha de rádio pode impedir um RX
   de capturar; três mensagens não são garantidas pelo broadcast.
7. Interrompa apenas o broker do ensaio: `flash` deve crescer. Reinicie um RX sem apagar a flash:
   a fila deve ser recuperada. Restaure o broker e confirme redução da fila após PUBACK.
8. Repita interrompendo a alimentação durante escrita, verificando temporário/quarentena/perdas.
   Esta etapa pode perder leituras em RAM; registre a diferença, não afirme perda zero.
9. Publique novamente o mesmo payload no mesmo tópico autorizado. Confirme apenas uma linha
   no banco para o par RX/evento. Faça isso somente com dispositivos/eventos de ensaio.
10. Teste credencial incorreta e publicação sob o UUID de outro receptor: broker deve negar,
    conforme seus logs e ausência da mensagem para o assinante/worker. MQTT conectado não prova ACL.
11. Interrompa o acesso do worker ao banco e reinicie o worker. Confirme recuperação da fila desse
    serviço: o PUBACK entregue ao ESP32 não oferece essa garantia por si só.

Consulta de conferência no SQL Editor (substitua pelo evento real do ensaio):

```sql
select receptor_id, evento_id, transmissor_id, propriedade_id,
       rssi_dbm, bateria_percentual, detectado_em, recebido_em,
       recebido_no_gateway_em, vinculo_id, zona_id
from public.deteccoes
where evento_id = '<EVENTO_REAL_DO_SERIAL>'
order by receptor_id;
```

Resultado esperado com três recepções válidas: três linhas, uma por receptor. Vínculo/zona
dependem de evidência temporal e das regras do worker; não preencher artificialmente para o teste.

## Estado da entrega

Alterações locais na `backend-iot`, sem commit/push. Documentos previamente excluídos em `docs/iot`
permaneceram como estavam no início. A documentação desta entrega está em `docs/firmware`.
Próximo passo operacional: provisionar UUIDs/segredos/credenciais, disponibilizar broker e worker
independentes, e executar o roteiro físico acima.
