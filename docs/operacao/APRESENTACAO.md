# Preparar e apresentar o Argos

Roteiro do dia da apresentação, atualizado em 23/11/2026 para a `dev` com o pacote Argos-IoT integrado.
Detalhes de cada componente: `docs/operacao/EXECUTAR_MVP.md` (Larápio), `broker/README.md`,
`worker/README.md`, `ml/README.md`, `firmware/README.md`.

## 1. Como as peças se ligam

```text
coleira ESP32 ──ESP-NOW (canal 2)──► 3 receptores ESP32 ──Wi-Fi 2,4 GHz──► EMQX (broker/)
   ──► worker/ (fila SQLite) ──internet──► Supabase ◄── ml/ (posições + previsões GRU)
                                              ▲
                          API Express (backend/) ◄── telas (frontend/)
```

| Componente | Onde roda | Comando | Observação |
|---|---|---|---|
| Broker EMQX | Notebook IoT | `docker compose --env-file broker/.env -f broker/docker-compose.yml up -d --wait` | Usuários/ACL em `broker/private/` |
| Worker de ingestão | Notebook IoT | `cd worker; npm run build; npm start` | **Único ingestor.** Node 24 |
| Worker de ML | Notebook IoT | `cd ml; .\.venv\Scripts\python.exe -m argos_ml.cli worker` | **Único processador.** Python 3.12 + TensorFlow 2.20 |
| API | Notebook da tela | `pnpm --dir backend start` | Lê o Supabase com o login do usuário |
| Telas | Notebook da tela | `pnpm --dir frontend dev` → `http://localhost:5173/Argos/` | |

`scripts\iniciar-argos.ps1` sobe tudo na ordem certa (`-SomenteIoT` / `-SomenteApp` para dividir entre
notebooks). **Não iniciar** `pnpm --dir backend mqtt:worker` nem `iot/`: são as versões antigas e
duplicariam ingestão e processamento.

### Divisão recomendada

- **Notebook IoT = o do Larápio.** Já tem `broker/.env`, `broker/private/`, `worker/.env`, `ml/.env`, o modelo
  `ml/model/artifacts/posicao-piloto-v1` e o estado `ml/data/academic-demo.sqlite`, e as placas estão gravadas com o
  IP e as senhas MQTT dele. Mudar de notebook exige reprovisionar o broker e regravar as placas.
- **Notebook da tela = qualquer um com a `dev`**, `backend/.env` e `frontend/.env` (chave publishable). Ele não
  conversa com as placas; só lê o Supabase. Pode ser o mesmo notebook IoT.

## 2. Requisitos de rede (o ponto mais frágil)

1. **Roteador 2,4 GHz com canal fixo 2** (o firmware atual usa o canal 2 em coleiras e receptores). Rede só 5 GHz
   não serve. Rede da instituição costuma isolar clientes e não permite fixar canal: leve um roteador próprio.
2. **Internet no roteador** (cabo, ou celular roteando 4G para o roteador). Sem internet: o worker guarda as leituras
   na fila e as telas ficam paradas até a internet voltar; os receptores também usam `pool.ntp.org` para a hora.
3. Notebook IoT conectado nesse roteador, com o **mesmo IP** gravado em `ARGOS_MQTT_HOST` das placas. Reserve o IP
   no DHCP do roteador pelo MAC do notebook. Se mudar, ajuste `ArgosDevice.local.h`/`ArgosSecrets.h` e regrave.
4. `broker/.env` com `MQTT_BIND_HOST` = IP do notebook nessa rede (ou `0.0.0.0` com firewall restrito à LAN) e
   `docker compose ... up -d` de novo depois de mudar.
5. Firewall do Windows liberando TCP 1883 só na rede local: `scripts\allow-mqtt-esp32.ps1` (Larápio) ou
   `scripts\preparar-notebook.ps1` (que também lista as redes 2,4 GHz e seus canais).

## 3. Véspera (checklist)

- [ ] `git pull` da `dev` nos dois notebooks; `pnpm install --frozen-lockfile`; `npm --prefix worker ci`.
- [ ] Notebook IoT: Docker Desktop abrindo sem erro; `node -v` = 24; `ml\.venv` com TensorFlow (`python -c "import tensorflow"`).
- [ ] Roteador configurado (canal 2, IP reservado, internet) e testado com as placas ligadas.
- [ ] `cd worker; npm run check:database; npm run check:mqtt` sem erro.
- [ ] `cd ml; .\.venv\Scripts\python.exe -m argos_ml.cli worker --once` (com `ARGOS_WRITE_ENABLED=0` na sessão) sem erro.
- [ ] Login nas telas com a conta da propriedade `8da8c584-…` (dona dos receptores RX-001/002/003 e da coleira TX-0001/A001).
- [ ] Baterias/cabos USB das coleiras e receptores; receptores posicionados como no cadastro (Cadastrar › Mapa).
- [ ] Ctrl+F5 nas telas (mapa satélite usa zoom até 17).

## 4. No dia, na ordem

1. Ligar roteador → notebook IoT na rede → `scripts\iniciar-argos.ps1 -SomenteIoT`
   (EMQX → worker → ML). No worker, esperar `mqtt_assinado`.
2. Ligar os **receptores** e conferir no Monitor Serial: Wi-Fi, NTP, MQTT conectados, fila baixando.
3. Ligar a **coleira** (beacon a cada 5 s, repetido 3 vezes).
4. Notebook da tela: `scripts\iniciar-argos.ps1 -SomenteApp`, abrir `http://localhost:5173/Argos/` e entrar.
5. Conferir no SQL Editor (somente leitura) que chegam detecções novas e posições:

   ```sql
   select max(recebido_em) from public.deteccoes;
   select origem, count(*), max(observado_em) from public.argos_localizacoes group by origem;
   select modelo_versao, count(*), max(previsto_para) from public.argos_predicoes group by modelo_versao;
   ```

## 5. Roteiro sugerido para a banca

1. **Contagem por zona:** levar a coleira para perto de um receptor; no início, A001 aparece recente no
   piquete daquele receptor (atualização por consulta periódica, alguns segundos).
2. **Mapa:** posição estimada por trilateração RSSI com 3 receptores, com o selo de estimativa experimental.
3. **Robustez:** desligar a internet do roteador por ~1 min; as leituras ficam na fila do worker; ao voltar,
   chegam com o horário real da captura, sem duplicar (mostrar contagem/histórico).
4. **ML:** explicar a previsão de posição do GRU como demonstração técnica (seção 6).
5. **Cadastros e avisos:** vínculo coleira→animal, central de avisos (receptor sem leitura, sincronização).

**Plano B:** se as telas falharem, o `monitor-demo` do Larápio (`monitor-demo\INICIAR_MONITOR.bat`, no notebook IoT)
mostra as posições lendo o Supabase em `http://127.0.0.1:8765`. Ele usa a chave secreta localmente: não expor na rede.

## 6. O que dizer (e não dizer) sobre os resultados

- Posições são **estimativas RSSI experimentais** no referencial `curral-demo-v1`; as coordenadas dos receptores e a
  calibração (−50 dBm a 1 m, expoente 2,6) **não foram medidas**. O resíduo médio (~3,7 m) mede o ajuste, não o erro real.
- O GRU `posicao-piloto-v1` foi treinado com 99 amostras de ~17 minutos e **não supera a referência de persistência**
  (MAE 0,93 m contra 0,65 m). Está aprovado só para demonstração (`demo_approved`, `approved=false`).
- Comportamento (comendo, parado etc.) **não é classificado**: não há rótulos observados; as telas mostram indisponível.
- Temperatura, imagens e bateria não têm fonte; aparecem como simulados ou "—".

## 7. Se algo der errado

| Sintoma | Verificar |
|---|---|
| Receptor sem Wi-Fi | Rede 2,4 GHz, canal 2, SSID/senha em `ArgosSecrets.h` |
| MQTT −2 no Serial | IP do notebook mudou, `MQTT_BIND_HOST`, firewall 1883, EMQX parado (`docs/firmware/MQTT_MENOS_2.md`) |
| MQTT 4/5 | Usuário/senha/ACL do receptor no broker (`npm run provision:sync`) |
| Worker não grava | `worker/.env`, internet, `npm run queue -- status` (fila) |
| Sem posições novas | Worker ML rodando, 3 receptores ouvindo o mesmo beacon, jobs em `argos_iot_jobs` |
| Tela sem dados | Login na conta da propriedade, API rodando, `CORS_ORIGIN` do backend |
| Satélite "Map data not yet available" | Ctrl+F5; `VITE_MAPA_SATELITE_ZOOM_MAX` |
