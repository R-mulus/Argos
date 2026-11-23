# Mapa de monitoramento (telas Animais e Receptores)

Atualizado em 17/11/2026. Substitui o mapa ilustrativo em SVG (`MapaIlustrativoZona`, removido).

## Como o mapa obtém a posição dos animais

```
coleira ESP32 → receptores ESP32 → MQTT → worker Node (deteccoes)
  → gatilho argos_agendar_localizacao → argos_iot_jobs
  → worker Python (iot/argos_iot): trilateração com 3+ receptores → argos_localizacoes
  → view argos_localizacoes_recentes → GET /api/iot/localizacoes/recentes → frontend
```

O frontend **não calcula posição** nem lê pacotes MQTT. Ele recebe as cinco últimas estimativas de
cada animal e decide qual move o marcador (`frontend/src/lib/localizacao.ts`):

| Situação | Tratamento |
|---|---|
| 1 ou 2 receptores ouviram o beacon | O worker não grava posição (`receptores_insuficientes`). O animal aparece só na contagem da zona (selo tracejado "N na zona"), nunca num ponto. |
| 3+ receptores | Estimativa do worker. Exibida em metros locais; o resíduo do ajuste aparece como "não é margem de erro". |
| Sem horário (`observado_em` nulo, sem NTP) | Fica fora da view e da posição. |
| Evento repetido (mesmo `evento_id`) | Uma só estimativa; não gera movimento. |
| Estimativa atrasada | Entra na ordem de detecção; não puxa o marcador para trás. O popup mostra detecção, recebimento e processamento. |
| Salto além de 4 m/s + 20 m de folga | Só é aceito se a estimativa seguinte confirmar. Se ela voltar, o salto fica "descartado" (ponto vazado na trilha); se ainda não houver seguinte, "aguardando confirmação". Nada é escondido. |
| Sem leitura recente (> 5 min) | Mantém a última posição em cinza, se não houver detecção por zona mais nova. |
| Intervalo > 10 min na trilha | Trecho tracejado (sem cobertura), sem pontos inventados. |

A movimentação visual (0,9 s, desligada com `prefers-reduced-motion`) só acontece entre duas
estimativas aceitas. Não há intervalo artificial de movimento no modo real.

**Atualização:** consulta a cada 15 s (TanStack Query). O Realtime do Supabase não está ligado para
`argos_localizacoes` (a tabela não está na publicação `supabase_realtime`). Para evoluir: adicionar a
tabela à publicação (as políticas RLS de leitura já existem), assinar `postgres_changes` filtrado por
`propriedade_id` e, a cada evento, invalidar a chave `["espacial", origem, "recentes"]`. A view já
devolve cinco estimativas por animal, o que recupera o que chegou durante uma queda de conexão.

## Componentes

- `components/custom/MapaMonitoramento.tsx`: avisos, legenda, lista acessível de animais/receptores; carrega o mapa sob demanda.
- `components/custom/MapaCanvas.tsx`: instância do MapLibre (carregada só quando o mapa aparece). Criada uma vez por referência espacial; dados entram por `setData`, sem recriar o mapa.
  - Animais: camada de símbolos com ícone desenhado em canvas (tamanho fixo em pixels), agrupamento da fonte GeoJSON e contagem dos grupos em marcadores DOM.
  - Receptores e contagens por zona: botões React em portais, posicionados por `maplibregl.Marker`.
  - Popups com conteúdo React (`DetalhesMapa.tsx`).
- `hooks/useMapaMonitoramento.ts`: consultas; `lib/mapa.ts`: junta resumo, comunicação, coordenadas e estimativas.
- `lib/referenciaEspacial.ts`: metros locais → coordenadas do mapa.
- `components/custom/PosicionamentoCanvas.tsx`: satélite para marcar a origem e os receptores (Cadastrar › Mapa). `lib/coordenadas.ts` lê coordenadas e links do Google Maps.
- `components/custom/EditorZonaCanvas.tsx`: desenho do contorno das zonas com [Terra Draw](https://github.com/JamesLMilner/terra-draw) sobre o MapLibre (a Drawing Library do Google Maps foi descontinuada). O polígono desenhado é convertido para metros locais por `anelParaMetros`.
- `lib/espacial.ts`: fonte da API e fonte da prévia (simulada, só nas rotas `#/demonstracao/*`, com selo "Simulado").

## Referência espacial e calibração

Cadastrar › **Mapa** (item "Cadastrar" da navbar, rota `/configuracoes?aba=mapa`):

1. **Escolha uma origem (0, 0)** fácil de achar em campo (um mourão, um canto do curral). Os eixos x e y são perpendiculares; meça em metros.
2. **Receptores**: cadastre x e y de cada receptor ativo a partir dessa origem, RSSI a 1 m (dBm) e expoente de perda *n*. Calibração sugerida: coleira a 1 m do receptor por alguns minutos (mediana do RSSI) e depois a 5, 10 e 20 m para ajustar *n*. A trilateração só considera receptores com coordenadas e exige três ou mais, não colineares.
3. **Localização**, uma de duas:
   - **Mapa de satélite** (padrão): em "Ir para a fazenda", cole as coordenadas (`-18,5789 -46,5181`) ou um link do Google Maps com `@lat,lon`, ou use **Minha localização** no celular, em campo. Clique no satélite para marcar a origem (0, 0). Depois escolha um receptor em "O clique marca" e clique onde ele está instalado, ou arraste os marcadores. **Salvar localização** grava a origem e converte os receptores reposicionados para metros. O azimute (graus a partir do norte, sentido horário) define para onde aponta o eixo +y; 0 = norte. Receptores com coordenadas salvas acompanham a origem; os reposicionados ficam presos ao ponto clicado.
   - **Planta**: endereço https de uma imagem aérea ou planta e o retângulo que ela cobre em metros (x/y mínimos e máximos). Não há latitude/longitude; a tela mostra só metros. A imagem precisa permitir CORS.
4. **Contorno das zonas** (opcional): escolha a zona e clique em **Desenhar contorno**. Clique os vértices sobre o mapa e feche no primeiro ponto (ou Enter; Esc cancela). Depois dá para arrastar vértices, criar um no meio de um lado e apagar com o botão direito. **Salvar contorno** grava em metros locais. Funciona nos três modos (mapa geográfico, planta ou grade), sempre posicionado pelos receptores. Sem mouse: "Digitar vértices", um por linha (`x; y`). Sem contorno, a contagem da zona aparece junto do receptor.

Sem referência, o mapa mostra a **grade local em metros** e o aviso de configuração pendente.
Coordenadas geográficas nunca são inventadas: nos modos planta e grade, os metros são desenhados
num plano perto de (0°, 0°) só porque o MapLibre trabalha em longitude/latitude; esses valores não
são exibidos nem tratados como GPS.

**Imagem de satélite:** Esri World Imagery (`server.arcgisonline.com`), com a atribuição "Powered by
Esri · Esri, Maxar, Earthstar Geographics e GIS User Community". Serve para uso não comercial, como este
projeto acadêmico. Para uso comercial ou contínuo, use um provedor com chave (ArcGIS Location
Platform, MapTiler) em `VITE_MAPA_ESTILO_URL`. A Drawing Library e os tiles do Google Maps não são usados.

**Visual (Figma "Estado área 1"):** zona em foco com contorno laranja e preenchimento quase
transparente; outras zonas com contorno branco tracejado; receptores e animais em círculos brancos
com ícone marrom; ponto verde no receptor indica comunicação recente; animal desatualizado com anel
tracejado cinza.

## API (todas exigem `Authorization: Bearer`, propriedade da sessão e RLS)

| Rota | Uso |
|---|---|
| `GET /api/iot/localizacoes/recentes` | Até 5 estimativas por animal (view), com `recebido_em`. Até 1.000 linhas (200 animais). |
| `GET/PUT /api/iot/referencia-espacial` | Referência da propriedade. PUT: `{modo:"geografico", origem_latitude, origem_longitude, azimute_eixo_y_graus}` ou `{modo:"planta", planta_url, planta_x_min_m, planta_y_min_m, planta_x_max_m, planta_y_max_m, azimute_eixo_y_graus?}`. |
| `GET /api/iot/zonas/geometrias` | Contornos `{zona_id, pontos:[[x,y],…]}`. |
| `PUT/DELETE /api/iot/zonas/:id/geometria` | `{pontos}` com 3 a 200 vértices e área ≥ 1 m². |
| `GET/PUT /api/iot/receptores/coordenadas` | Existentes (calibração dos receptores). |

Migração: `supabase/migrations/20261118113632_argos_referencia_espacial.sql` (aditiva, aplicada no projeto hospedado em 18/11/2026). Teste do
banco: `supabase/testes/referencia_espacial.sql`, num PostgreSQL local.

## Testes

- `pnpm --dir frontend test`: regras de estimativas (duplicadas, atrasadas, inválidas, sem horário, no futuro, saltos), projeção, montagem dos dados.
- `node frontend/verificar-mapa.mjs [url]`: navegador real sobre a prévia (ícone constante no zoom, pan, redimensionamento, agrupamento, re-renderização, nova estimativa sem recriar o mapa, troca de zona, remontagem sem vazamento, cenário vazio, desenho e edição de contorno, marcação da origem e de receptor no satélite). Requer Playwright instalado só localmente.
- `pnpm --dir backend test`: validação dos corpos e 401 nas rotas novas.

## O que depende de campo

- Coordenadas e calibração reais dos receptores (hoje RX-001/002/003 têm valores de teste).
- NTP nos receptores: sem `detectado_em`, o worker não localiza.
- Pelo menos três receptores ouvindo a mesma coleira, fora de linha reta.
- Validar a precisão em campo antes de tirar conclusões: RSSI varia com corpo do animal, umidade e relevo.
