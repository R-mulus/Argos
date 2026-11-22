# Auditoria da etapa 2 — 21/11/2026

Branch de trabalho: `backend-iot`. Referência inspecionada: `origin/dev`,
commit `f804390aa6664400413e476db278f3075a1c0b18`. Nenhum checkout/merge em dev ou main.
Alterações pré-existentes de firmware/broker e a cópia aninhada `Argos/` foram preservadas.

## Componentes existentes

- `worker/src/contract.ts`: beacon v1 com `evento_id=transmissor:boot_nonce:sequencia`,
  RSSI, bateria do transmissor e instante observado. Um evento em vários receptores é legítimo.
- `worker/src/database.ts`: upsert de detecção por `(receptor_id,evento_id)`; valida dispositivos,
  propriedade, tipos e vínculo temporal. O novo módulo não altera esse contrato.
- Em dev, `iot/argos_iot/{localizacao,eventos,worker,ml,train}.py` já esboça localização e GRU conjunta.
  Foram reutilizados os contratos/índices/UUIDs e a fila, mas a etapa nova separa regressão e classificação
  para não condicionar previsão de posição à existência de rótulos de alimentação.
- `backend/src/controllers/iot.controller.ts`: localização, predições e cadastro de coordenadas.
- `backend/src/app.ts`: rotas `/api/iot/localizacoes`, `/predicoes`, `/receptores/coordenadas`.
  **Não existe `/api/iot/habitos` nessa revisão**. Cadastro animal/dispositivo/vínculo e pesagem já têm API.
- `frontend/src/pages/Home.tsx`: importa diversos objetos `*Simulado`.
  `DistribuicaoComportamento.tsx` usa 42/21/31/6 por padrão; não são resultados de inferência.
  `AnalisesModelo.tsx` e `MediaMovimentacao.tsx` também possuem demonstrações.

## Banco real consultado somente para leitura

Projeto Argos, schema `public`. Consulta feita por MCP, incluindo columns, constraints, índices,
políticas RLS, trigger de fila e contagens. Contagens são fotografia do momento e não validam proveniência.

| Dado | Quantidade |
|---|---:|
| Detecções | 4.511 |
| Detecções com instante observado | 4.475 |
| Receptores distintos em detecções | 9 |
| Eventos com ≥3 receptores | 103 |
| Eventos com ≥3 receptores cadastrados na calibração | 103 |
| Coordenadas/calibrações cadastradas | 5 |
| Localizações armazenadas | 2 |
| Vínculos cadastrados | 50 |
| Rótulos em `argos_observacoes_visao` | 0 |
| Predições | 0 |
| Jobs pendentes | 208 |

Há dados legados e de ensaios no projeto. Não se afirma que todas as 4.511 detecções sejam
medições de campo validadas. Coordenadas existentes precisam ser conferidas fisicamente.
Duas posições não são histórico suficiente para GRU; sem rótulos não existe classificador real treinável.

O ensaio Python de todos os 103 eventos com três receptores retornou **103 `geometria_degenerada`**
e zero gravações. Há coordenadas cadastradas na escala de centenas de milhares de metros, junto
de pontos `(60,100)` e `(120,0)`. Esse cadastro precisa ser conferido no referencial local medido;
não foi substituído por coordenadas inventadas. O primeiro lote de 50 jobs pendentes foi também
avaliado sem escrita e retornou `receptores_calibrados_insuficientes` em todos os casos.

As migrations consultadas em dev foram `20261116000000_argos_iot_processamento.sql` e
`20261116181500_argos_alinhamento_remoto.sql`. O schema remoto também contém tabelas de
referência espacial e geometria de zonas; não foram alteradas/usadas para inventar latitude/longitude.

`argos_localizacoes`, `argos_predicoes`, `argos_posicoes_receptores`, `argos_iot_jobs` e
`argos_observacoes_visao` têm RLS ativo. Localizações/predições têm SELECT de authenticated
condicionado à propriedade de `auth.uid()`. Jobs/rótulos não possuem acesso de frontend.
A chave administrativa do processador deve permanecer no backend; escopo explícito de propriedade
é aplicado pelo cliente adicionalmente ao controle de acesso.

Índices únicos existentes:
- Localização: `(propriedade_id,transmissor_id,evento_id)`.
- Predição: `(propriedade_id,animal_id,evento_id,modelo_versao)`.
- Jobs: PK `(propriedade_id,transmissor_id,evento_id)`.

O trigger `argos_agendar_localizacao` existe e reage ao INSERT de detecção. Ele agenda/reabre o job,
inclusive quando chega um quarto receptor. Não foi criada outra fila no Supabase.

O schema real de predições já tem `observado_em`, `previsto_para`, `evento_id`, `atual_x_m`,
`atual_y_m`, ausentes do antigo arquivo Schema_argos.txt. Foi priorizado o banco real.
Porém comportamento/confiança/probabilidades são NOT NULL. Uma regressão sem classificação
precisa permitir NULL. A proposta está em `sql/proposta_predicao_posicao.sql`; não aplicada.

## Fontes dos KPIs

| Informação | Fonte / condição |
|---|---|
| Identificação, sexo, raça, nascimento | `animais` |
| Peso | última `pesagens` até o fim do período, com data |
| Distância/velocidade | intervalos válidos de `argos_localizacoes`, estimativas RSSI |
| Tempo em movimento | apenas intervalos cobertos; estado aparente |
| Comendo/parado/movimento/outro | rótulos aceitos ou modelo aprovado, separados por origem |
| RSSI | sinal dos beacons em `deteccoes`, não Wi-Fi do receptor |
| Bateria na detecção | transmissor; não reutilizar como bateria do receptor |
| Receptor comunicando | recepção recente; não prova heartbeat/estado online |
| Perda de pacotes | indisponível sem contadores |
| Precisão real, agrupamento, temperatura | indisponíveis neste pipeline |
| Métricas GRU | manifesto medido; inicialmente indisponíveis |

Não houve gravação de dados, aplicação de migration, treinamento real, commit ou push durante a auditoria.
