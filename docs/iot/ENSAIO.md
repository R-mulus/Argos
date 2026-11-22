# Ensaio físico do Argos (receptor ESP32 → tela)

Roteiro para validar, na ordem do plano, uma leitura física até o dashboard: um receptor, recuperação
offline, três receptores e o worker Python. Atualizado em 19/11/2026. Tudo aqui depende de hardware e
ainda **não foi executado**; registre o resultado de cada etapa em `docs/iot/VALIDACAO.md`.

## 1. Rede: o ESP32 só usa 2,4 GHz

O ESP-NOW das coleiras e o Wi-Fi do receptor compartilham **um único rádio no mesmo canal**
(`ARGOS_WIFI_CHANNEL`, padrão 6). Por isso:

- a rede precisa ser **2,4 GHz** com canal **fixo** (nunca "automático"). Redes só 5 GHz, como
  "Xavier 5G Paranet" no canal 149, não aparecem para o ESP32 (o Serial mostra `[WiFi] desconectado (201)`);
- o canal da rede, `ARGOS_WIFI_CHANNEL` dos receptores e o das coleiras precisam ser o mesmo número.

Opções para a apresentação, da mais previsível para a menos:

| Opção | Vantagem | Cuidado |
|---|---|---|
| Roteador 2,4 GHz próprio (até um antigo), canal fixo 6 | Não depende da rede do local; o canal é controlado | Notebook e receptores conectados a ele |
| Roteador de casa com rede 2,4 GHz separada | Bom para ensaiar em casa | Fixe o canal da banda 2,4 GHz no painel do roteador |
| Hotspot do notebook (Windows › Hotspot móvel › banda 2,4 GHz) | Notebook vira gateway: use `ARGOS_MQTT_HOST "gateway"` | O Windows não deixa escolher o canal: veja o canal no Serial (`[WiFi] ... canal N`) e recompile coleiras e receptores com esse N se for diferente |
| Hotspot do celular em 2,4 GHz | Simples | Canal também automático; o notebook precisa estar na mesma rede |

Não use a rede da instituição: em geral isola clientes Wi-Fi entre si e não permite fixar o canal.

## 2. Notebook (gateway)

**Atalho (PowerShell na raiz do repositório):**

| Script | O que faz | Administrador |
|---|---|---|
| `scripts\preparar-notebook.ps1` | Firewall 1883/123 só na rede local, servidor NTP do Windows, IPs do notebook, Wi-Fi atual, redes 2,4 GHz próximas com canal, estado do EMQX. `-Desfazer` remove tudo depois | Sim |
| `scripts\configurar-worker-python.ps1` | Pede a connection string sem exibir, grava `iot/.env`, cria `iot/.venv`, instala dependências e testa a conexão | Não |
| `scripts\iniciar-argos.ps1` | Sobe EMQX, worker MQTT, API, frontend e worker Python em janelas separadas, na ordem certa | Não |

Rode com `powershell -ExecutionPolicy Bypass -File scripts\<nome>.ps1`. Os passos manuais equivalentes estão abaixo.

1. **IP:** `ipconfig` › adaptador Wi-Fi › "Endereço IPv4" (em casa, hoje, `192.168.89.122`; muda em
   outra rede). Ignore `vEthernet (WSL/Default Switch)`. No hotspot do Windows o IP costuma ser `192.168.137.1`.
2. **Firewall** (PowerShell como administrador):

   ```powershell
   New-NetFirewallRule -DisplayName "Argos MQTT 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -RemoteAddress LocalSubnet -Action Allow
   New-NetFirewallRule -DisplayName "Argos NTP 123" -Direction Inbound -Protocol UDP -LocalPort 123 -RemoteAddress LocalSubnet -Action Allow
   ```

   Remova depois da apresentação com `Remove-NetFirewallRule -DisplayName "Argos MQTT 1883"` (idem NTP).
3. **Horário sem internet (servidor NTP no Windows).** Acerte o relógio do notebook antes de sair de casa e rode
   (PowerShell como administrador):

   ```powershell
   reg add HKLM\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders\NtpServer /v Enabled /t REG_DWORD /d 1 /f
   reg add HKLM\SYSTEM\CurrentControlSet\Services\W32Time\Config /v AnnounceFlags /t REG_DWORD /d 5 /f
   sc.exe config w32time start= auto
   net stop w32time; net start w32time
   w32tm /query /configuration   # NtpServer deve aparecer com Enabled: 1
   ```

   Se a rede tiver internet, o receptor também tenta `pool.ntp.org` sozinho. Sem nenhum NTP, as leituras
   ficam retidas no receptor por até `ARGOS_TIME_WAIT_S` (10 min) e depois seguem com `detectado_em: null`,
   que **não entram na contagem** (regra mantida de propósito: sem horário não há vínculo histórico seguro).
4. **Broker:** `docker compose up -d emqx` na raiz (ou o container manual descrito em `docs/iot/BROKER.md`).
   No painel `http://localhost:18083`:
   - um usuário por receptor (ex.: `receptor-RX-001`) com permissão **só de publicar** em
     `argos/v1/propriedades/8da8c584-e51b-4b99-808d-8cf55cee7674/receptores/<UUID do receptor>/deteccoes`;
   - Controle de acesso › Autorização › Configurações: **Deny Action = disconnect** (o compose já define
     `EMQX_AUTHORIZATION__DENY_ACTION=disconnect`). Com `ignore`, uma ACL errada faz o EMQX responder PUBACK
     e descartar a leitura, e o receptor apaga o arquivo achando que entregou.
5. **Processos** (cada um num terminal; subir o broker não inicia os outros):

   | Processo | Comando | Necessário para |
   |---|---|---|
   | EMQX | `docker compose up -d emqx` | tudo |
   | Worker MQTT | `pnpm --dir backend mqtt:worker` | gravar em `deteccoes` |
   | API Express | `pnpm --dir backend dev` | telas |
   | Frontend | `pnpm --dir frontend dev` | telas |
   | Worker Python | `cd iot; .venv\Scripts\Activate.ps1; python -m argos_iot.worker` | posição no mapa (etapa 3) |

   O worker Python precisa de `iot/.env` com `DATABASE_URL=postgresql://...` (conexão direta do Supabase,
   em Project Settings › Database; fora do Git). Sem ele, contagem por zona funciona, mas o mapa não recebe posição.

## 3. Firmware do receptor

Em `firmware/ArgosReceptor/`, copie `ArgosSecrets.h.example` para `ArgosSecrets.h` e preencha SSID, senha,
usuário/senha MQTT do receptor e o mesmo `ARGOS_BEACON_SECRET` das coleiras. Em `ArgosConfig.h`:

| Item | Ensaio | Observação |
|---|---|---|
| `ARGOS_RECEIVER_UUID` | RX-001 `9b3cc23c-…`, RX-002 `45bd6322-…`, RX-003 `83bba45a-…` | Um por placa |
| `ARGOS_LOCAL_PLAINTEXT` | `1` | Porta passa a 1883 automaticamente. O TLS 8883 do EMQX usa o certificado padrão da imagem, que o ESP32 não valida |
| `ARGOS_MQTT_HOST` (secrets) | IP do notebook, ou `"gateway"` no hotspot do notebook | Nunca `localhost`/`127.0.0.1` |
| `ARGOS_WIFI_CHANNEL` | canal 2,4 GHz da rede | Igual nas coleiras |
| `ARGOS_NTP_SERVER` | `""` ou IP do notebook | O gateway e `pool.ntp.org` já são consultados |

Coleira: `firmware/ArgosTransmissor/ArgosConfig.h` com `ARGOS_TRANSMITTER_UUID` = TX-0001
`3fa85f64-5717-4562-b3fc-2c963f66afa6` (vinculada ao animal A001 desde 16/11 14:29 UTC) e o mesmo canal.

### Monitor Serial (115200)

| Mensagem | Significado / ação |
|---|---|
| `[WiFi] desconectado (201)` | Rede não achada no canal: SSID, banda 2,4 GHz, canal |
| `[WiFi] desconectado (15/202/204)` | Senha do Wi-Fi |
| `[WiFi] ponto de acesso no canal X; coleiras no canal Y` | Fixe o canal ou recompile; o receptor continua captando na flash |
| `[WiFi] conectado ... IP ... gateway ... canal ...` | Confira se o IP está na mesma faixa do notebook |
| `[Hora] sincronizada: ...` | NTP ok; leituras retidas recebem o horário real |
| `[MQTT] falha ... (-2)` | IP/porta errados, EMQX parado ou firewall |
| `[MQTT] falha ... (4)` / `(5)` | Usuário/senha MQTT / sem permissão |
| `[MQTT] publicacao sem PUBACK` | Broker caiu ou ACL com `disconnect`; o evento é reenviado |
| `[Status] ... Fila:N Perdidas:N HoraRecuperada:N SemHora:N` | A cada 5 s. `SemHora` > 0 indica leituras que não entrarão na contagem |

## 4. Etapas de validação

Consultas de conferência no SQL Editor do Supabase (somente leitura):

```sql
-- Últimas leituras reais (sem a carga DEMO)
select r.codigo, d.evento_id, d.rssi_dbm, d.detectado_em, d.recebido_no_gateway_em, d.recebido_em,
       z.nome as zona, d.vinculo_id is not null as com_vinculo
from deteccoes d join dispositivos r on r.id = d.receptor_id left join zonas z on z.id = d.zona_id
where d.evento_id not like 'DEMO%' order by d.recebido_em desc limit 20;
```

1. **Um receptor (RX-001).** Serial com WiFi, Hora e MQTT OK; coleira ligada perto. Esperado: linha com
   `detectado_em` preenchido, zona **Piquete 1** e vínculo; no início do app, A001 contado em Piquete 1.
   Se `zona` vier nula, confira se a zona foi editada depois da leitura (a regra exige `zonas.updated_at` anterior).
2. **Recuperação.** (a) Pare o worker MQTT por 2 min e volte: as leituras chegam com `recebido_no_gateway_em`
   posterior e o mesmo `detectado_em`. (b) Pare o EMQX (`docker stop argos-emqx`) por 2 min: `Fila` sobe no Serial;
   ao voltar, a fila esvazia e as leituras atrasadas **mantêm zona e vínculo**. (c) Reinicie o receptor com fila
   pendente: nenhum evento duplica (`(receptor_id, evento_id)` é único). (d) Ligue o receptor sem NTP disponível e
   habilite depois: `HoraRecuperada` sobe e as leituras ganham horário.
3. **Três receptores.** O mesmo `evento_id` aparece em RX-001/002/003. Meça as posições reais em metros a partir
   de uma origem (não colineares) e cadastre em Cadastrar › Mapa; os valores atuais (0,0), (120,0), (60,100)
   são de teste. Calibre `rssi_1m_dbm` e `expoente_perda` (coleira a 1 m, depois 5, 10 e 20 m). **Não altere
   coordenadas com leituras pendentes:** o Python usa a calibração vigente no processamento.
4. **Worker Python.** Com `iot/.env`, jobs passam de `pendente` para `localizado` (ou `receptores_insuficientes`,
   `sem_horario`, ...). Conferir `select estado, count(*) from argos_iot_jobs group by estado;` e o marcador no mapa.
   O resíduo exibido mede o ajuste das distâncias RSSI, não o erro real.

Previsões GRU: não há modelo treinado. O worker roda sem `ARGOS_MODEL_DIR` e a tela não exibe previsão.
