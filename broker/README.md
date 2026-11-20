# Broker MQTT Argos

Um serviço EMQX Enterprise **6.3.2**, com Community License informada pela imagem,
em projeto Compose `argos-iot`. Volumes próprios `argos-iot_emqx-data` e `argos-iot_emqx-log`.
Nenhum container/volume anterior é dependência; volumes antigos não foram apagados.

## Preparar credenciais

Na pasta `worker`, execute `npm ci`. Há duas formas de provisionar:

```powershell
# Um receptor já configurado no firmware:
npm run provision -- --from-firmware

# Ou vários receptores: copie broker/devices.example.json para broker/private/devices.json,
# preencha UUIDs reais e mantenha a lista completa de receptores desejados:
npm run provision -- --devices ../broker/private/devices.json
```

Cada item precisa de `id` do receptor e `propertyId`. `username` e `password` são opcionais:
se omitidos, reutiliza a credencial privada existente para aquele ID ou gera uma nova.
O usuário padrão é `rx-<UUID>` e a senha gerada tem 32 bytes aleatórios em base64url.
`--from-firmware` preserva o usuário/senha já configurados em `ArgosSecrets.h`; não altera esse arquivo.
Se os valores estavam vazios, copie os gerados para o firmware antes de gravar a placa.

Saídas privadas, ignoradas pelo Git:

- `broker/private/credentials.json`: credenciais do worker e de cada receptor.
- `broker/private/users.json`: carga inicial do banco de autenticação EMQX, sem superusuários.
- `broker/private/acl.conf`: regras exatas por usuário/propriedade/receptor.
- `broker/private/worker.env`: configuração MQTT para iniciar um novo worker.
- `broker/.env`: bind/portas, senha administrativa aleatória e cookie Erlang aleatório.

O segredo HMAC fica apenas nos TXs/RXs: não é credencial MQTT nem chave Supabase.
Proteja esses arquivos e seus backups. O script não imprime as senhas.

## Iniciar e verificar

Na raiz do repositório:

```powershell
docker compose --env-file broker/.env -f broker/docker-compose.yml up -d --wait
docker compose --env-file broker/.env -f broker/docker-compose.yml ps
docker compose --env-file broker/.env -f broker/docker-compose.yml logs --tail 80 emqx
```

Dashboard em [http://localhost:18083](http://localhost:18083), usuário `admin`, senha
`EMQX_DASHBOARD_PASSWORD` do arquivo local. O healthcheck usa `/status` HTTP do EMQX;
autenticação e ACL são verificadas separadamente por `npm run check:mqtt` e pelo ensaio de integração.
O script de diagnóstico usa a credencial do worker e uma sessão temporária, sem publicar dados.

O Compose inicia em loopback por padrão. Para acesso pelo ESP32, em `broker/.env`:

```dotenv
MQTT_BIND_HOST=IP_DA_INTERFACE_LAN
MQTT_HOST_PORT=1883
MQTT_DASHBOARD_PORT=18083
```

Também é possível `MQTT_BIND_HOST=0.0.0.0`, restringindo o firewall à LAN confiável.
O dashboard continua limitado ao computador. O firmware precisa do IP LAN real do computador,
mesma porta, `ARGOS_LOCAL_PLAINTEXT=1`, e Wi-Fi 2,4 GHz no canal do transmissor.
Execute novamente `up -d` depois de alterar bind/portas; apenas `restart` não aplica ambiente novo.

Em outro computador da mesma rede: `Test-NetConnection <IP-LAN> -Port 1883`.
Isso verifica TCP desse computador, não a conectividade física do ESP32.

## Autorização e manutenção

Cada RX só pode publicar QoS **1**, retain **false**, no tópico que corresponde ao seu UUID
e à sua propriedade. Não pode assinar tópicos, publicar por outro receptor ou usar curingas.
O worker só pode assinar exatamente `argos/v1/propriedades/+/receptores/+/deteccoes` com QoS 1;
não pode publicar. A autorização depende do **usuário autenticado**, não de Client ID declarado.
Regra final nega tudo; publicação negada desconecta o cliente.

A carga inicial JSON é usada ao criar o autenticador e **não sobrescreve usuários existentes**.
Para adicionar usuários depois do primeiro boot, gere novamente com a lista completa e execute:

```powershell
# Em worker:
npm run provision -- --devices ../broker/private/devices.json
npm run provision:sync
# Na raiz, releia as ACLs montadas:
docker compose --env-file broker/.env -f broker/docker-compose.yml restart emqx
```

`provision:sync` usa a senha administrativa local, adiciona contas ausentes e preserva as existentes.
Para aplicar uma rotação de senhas deliberadamente configurada no manifesto, use
`npm run provision:sync -- --rotate` e atualize os respectivos dispositivos/worker.
Remover um RX da lista e reiniciar retira sua ACL; excluir a conta de autenticação é ação separada
no dashboard. Não edite o authorizer pelo dashboard: ele pode passar a usar outro arquivo na pasta data.
As configurações em `emqx.conf` prevalecem sobre ajustes persistidos pelo dashboard.

Nunca use `docker compose down -v` no broker de operação: isso remove as credenciais e mensagens
persistidas nos volumes. Para parar sem destruir dados, use `docker compose ... stop`.

## Durabilidade

Sessões duráveis habilitadas e retenção de mensagens de **7 dias**. O worker usa MQTT 5,
Client ID fixo, `clean=false` e expiração de sessão de 7 dias. O firmware continua em MQTT 3.1.1.
Essas versões interoperam no broker. O ensaio comprovou uma mensagem pendente recuperada após
reinício do EMQX, sem depender da memória do processo anterior.

**Primeiro conecte e assine com o worker.** Sem uma assinatura durável criada, mensagens enviadas
anteriormente não entram retroativamente na sessão. Expiração de sessão/retencão, disco cheio,
apagamento de volume e falha física de armazenamento ainda podem causar perda.
Um único nó não oferece alta disponibilidade; monitore uso dos volumes. Não foi feito benchmark de capacidade.

## TLS

Obtenha certificado válido para o hostname do broker e coloque `fullchain.pem` e `privkey.pem`
em `broker/private/tls`. Não foram gerados certificados fictícios.

```powershell
docker compose --env-file broker/.env -f broker/docker-compose.yml -f broker/docker-compose.tls.yml up -d --wait
```

O overlay habilita 8883 e desabilita o listener TCP sem TLS. A publicação de porta 1883 do Compose
base pode continuar aparecendo, mas sem listener atendendo. No worker use `mqtts://hostname:8883`;
`MQTT_CA_FILE` é opcional para CA pública, necessário para uma CA privada confiável.
No receptor configure porta 8883, `ARGOS_LOCAL_PLAINTEXT=0`, CA PEM e NTP válido.
A validação de certificado/hostname não é desativada. O handshake TLS real depende desses certificados
e não foi executado neste ambiente.

Referências: [autenticação e bootstrap](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/mnesia.html),
[ACL](https://docs.emqx.com/en/emqx/latest/guides/access-control/authz/file.html),
[sessões duráveis](https://docs.emqx.com/en/emqx/latest/guides/durability/durability_introduction.html)
e [retenção](https://docs.emqx.com/en/emqx/latest/guides/durability/management.html).
