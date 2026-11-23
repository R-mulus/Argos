# Broker MQTT (EMQX) do Argos

O EMQX recebe as leituras dos receptores ESP32 e as entrega ao worker do backend:
ESP32 receptor → EMQX → worker MQTT → SQLite → Supabase.

## Container atual (levantado em 16/11/2026)

O container `argos-emqx` foi criado manualmente no notebook da equipe. Configuração observada com `docker inspect` e `emqx ctl`:

| Item | Valor |
|---|---|
| Imagem | `emqx/emqx-enterprise:6.3.2` |
| Portas publicadas | 1883 (MQTT), 8883 (MQTT/TLS), 8083 e 8084 (WebSocket), 18083 (painel), todas em todas as interfaces |
| Reinício | `no` |
| Volumes | anônimos em `/opt/emqx/data` e `/opt/emqx/log` |
| Autenticação | usuário e senha no banco interno (`built_in_database`, SHA-256 com salt) |
| Autorização | regras do banco interno, depois o arquivo `etc/acl.conf`; sem correspondência, `deny` |
| Usuários | um para o worker e um de teste para receptores (nomes no painel; senhas fora do repositório) |
| TLS (8883) | listener ativo com o certificado padrão da imagem, não um certificado da equipe |

Diferenças para o `docker-compose.yml` do repositório: o compose publica o painel só em `127.0.0.1`, não publica 8083/8084 (o projeto não usa WebSocket), reinicia sozinho (`unless-stopped`) e usa volumes nomeados (`emqx-data`, `emqx-log`).

## Conferir as permissões

Use **Deny Action = disconnect** (Autorização › Configurações; o `docker-compose.yml` já define `EMQX_AUTHORIZATION__DENY_ACTION=disconnect`). Com o padrão `ignore`, uma publicação negada recebe PUBACK no MQTT 3.1.1 e é descartada: o receptor apaga a leitura da fila achando que entregou.


O EMQX avalia primeiro as regras do painel e depois o `acl.conf`. Se o arquivo terminar em `{allow, all}.`, como na configuração padrão, tudo o que as regras do painel não negarem fica permitido e o `no_match = deny` nunca é aplicado.

```powershell
docker exec argos-emqx cat /opt/emqx/etc/acl.conf
```

No painel (http://localhost:18083 › Controle de acesso › Autorização › Banco interno), confira as regras de cada usuário. O esperado:

- o usuário de cada receptor só **publica** em `argos/v1/propriedades/<propriedade>/receptores/<receptor>/deteccoes`, com o tópico exato e sem acento;
- o usuário do worker só **assina** `argos/v1/propriedades/+/receptores/+/deteccoes`;
- todo o resto é negado.

## Migrar o container manual para o compose sem perder usuários e permissões

1. Exporte a configuração e os dados (usuários, regras e ajustes feitos no painel):

   ```powershell
   docker exec argos-emqx emqx ctl data export
   ```

   O comando informa o caminho do arquivo `.tar.gz` gerado dentro do container. Copie-o para fora (por exemplo, para `Documentos`, **fora do repositório**):

   ```powershell
   docker cp argos-emqx:<caminho informado> $HOME\Documents\
   ```

2. Pare o container manual e renomeie-o, em vez de apagar, para mantê-lo como backup:

   ```powershell
   docker stop argos-emqx
   docker rename argos-emqx argos-emqx-manual
   ```

3. Na raiz do repositório, suba o broker pelo compose e importe o arquivo:

   ```powershell
   docker compose up -d emqx
   docker cp $HOME\Documents\<arquivo>.tar.gz argos-emqx:/opt/emqx/data/
   docker exec argos-emqx emqx ctl data import /opt/emqx/data/<arquivo>.tar.gz
   ```

4. Teste o worker (`pnpm --dir backend mqtt:worker`) e um receptor. Se tudo funcionar, apague o backup com `docker rm argos-emqx-manual`.

## Segurança na rede da apresentação

- Troque as senhas de teste por senhas longas e aleatórias e guarde-as fora do repositório (`backend/.env` e `ArgosSecrets.h` já são ignorados pelo Git).
- Troque a senha do painel do EMQX, se ainda for a padrão.
- Com o compose, o painel só abre no próprio notebook.
- A porta 1883 não é criptografada: use-a só na rede local do ensaio. TLS de verdade (8883) exige um certificado próprio e o CA dele no firmware (`ARGOS_MQTT_CA`).
