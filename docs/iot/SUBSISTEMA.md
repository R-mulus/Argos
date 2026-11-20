# Argos IoT independente

O projeto Compose `argos-iot` tem rede, volumes, nome de nó e portas próprios. A API Express e a branch dev não participam da inicialização. O receptor usa MQTT 3.1.1, QoS 1 e o tópico ASCII descrito em [CONTRATOS.md](CONTRATOS.md).

1. Na raiz, prepare `infra/emqx/users.local.csv` pelo exemplo se ainda não existir. Preserve senhas individuais e a regra por UUID em `acl.conf`. O bootstrap não troca senhas de usuários existentes.
2. Execute `docker compose -f infra/iot/compose.yaml up -d --wait`. O broker aceita conexões locais em 1885 e o painel em 18085. Para bancada, defina `$env:MQTT_BIND_HOST='192.168.18.14'` antes do comando, usando o endereço atual da interface Wi-Fi. A porta externa pode ser alterada por MQTT_HOST_PORT. O listener interno permanece em 1883. Confira a regra de entrada do Windows para a **porta externa selecionada** e os IPs dos receptores.
3. Copie `backend/iot.env.example` para `backend/.env.iot`. Preencha a senha do usuário argos-worker e as duas variáveis Supabase. Execute `pnpm --dir backend iot:worker`. O arquivo de configuração, Client ID e fila SQLite são exclusivos dessa instância. Para monitorar, consulte `http://127.0.0.1:3335`, os logs do worker e `docker compose -f infra/iot/compose.yaml exec broker emqx ctl clients list`.
4. No receptor, ajuste ARGOS_MQTT_PORT para a porta externa e ARGOS_MQTT_HOST para o IP LAN. Use o arquivo privado ArgosSecrets.h em ambas as funções. Configure o mesmo segredo HMAC da propriedade e canal 2,4 GHz nos dois sketches. Para outra placa, provisione ArgosDevice.h com o UUID cadastrado. Para novo TX, abra o vínculo com o animal. Para novo RX, cadastre o receptor, sua zona física, uma credencial exclusiva e permissão de publicação apenas no tópico correspondente. Os sketches comuns continuam os mesmos.
5. Para broker remoto, use MQTT_URL=mqtts://hostname:8883, NODE_ENV=production e remova a liberação de TCP local. Configure ARGOS_LOCAL_PLAINTEXT=0, porta TLS, hostname e CA real no receptor. O serviço dedicado aceita um broker MQTT compatível.
6. Para o ensaio isolado, rode o script abaixo **somente sem dispositivos ou worker operacional no broker de teste**. Ele usa EMQX com ACL real, API de persistência simulada e SQLite temporário. Valida rejeição de JSON, deduplicação, três pendências duráveis e recuperação após reinício.

```powershell
$env:MQTT_HOST_PORT='32885'
$env:MQTT_DASHBOARD_PORT='32085'
docker compose -p argos-iot-teste -f infra/iot/compose.yaml up -d --wait
$env:ARGOS_TEST_IOT='true'
$env:ARGOS_TEST_MQTT_URL='mqtt://127.0.0.1:32885'
pnpm --dir backend exec tsx --test tests/integracao/mqtt-offline.ts
docker compose -p argos-iot-teste -f infra/iot/compose.yaml stop
```

O parser, o processador, o repositório Supabase e a fila são reutilizados na própria branch. A fila confirma o recebimento ao broker depois da gravação SQLite. Mensagem malformada é rejeitada na primeira validação. Cadastro incompatível encerra o processamento da leitura. Falha temporária conserva a leitura para nova tentativa, sem limite que descarte dados. A reconexão MQTT usa espera crescente até 60 segundos. Consulte [operação e gravação](OPERACAO.md) para validar um evento físico e conferir captura, chegada, vínculo e zona no banco.

