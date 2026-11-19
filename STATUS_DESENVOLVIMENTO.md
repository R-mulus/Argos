> **16/11/2026 — revisão EMQX e previsão mensal de hábitos, alteração local em `backend-iot`.** Preservadas alterações locais preexistentes dos firmwares. Receptor corrigido para não formatar LittleFS automaticamente, preservar arquivo após falha de publicação e usar TLS/8883 por padrão com validação de configuração; removida sondagem TCP redundante. Guias `docs/iot/EMQX.md` e `firmware/LEIA_ME.md` orientam EMQX Cloud Serverless com limite de gastos zero e laboratório local. Nenhuma conta Cloud foi criada.
>
> **GRU por hábitos:** novos `iot/argos_iot/habitos.py` e `habitos_worker.py`, migração `20261116010000_argos_habitos.sql`, contrato `PrevisaoHabitos` e `GET /api/iot/habitos`. Consolidação por animal/zona em intervalos de cinco minutos, dias UTC, cobertura mínima explícita, separação cronológica sem janelas cruzando cortes, comparação com persistência/rotina semanal e saída direta de 30 dias. O alvo é proporção de observações por zona, não ações rotuladas nem coordenadas. Não depende do pipeline antigo de trilateração. Modelo não aprovado/dados insuficientes não geram previsão; falha de inferência não impede consolidação. Treino exige no mínimo técnico 300 dias. Sem dados reais de treino nem modelo operacional. Sem dependências novas de runtime; usa NumPy, psycopg e TensorFlow já declarados. Testes novos usam pytest.
>
> **Verificado nesta revisão:** 25 testes backend + typecheck; build e lint frontend (aviso de chunks grandes); 14 testes Python com PostgreSQL 17 descartável, migrações, reconciliação, upsert e RLS; ensaio worker/EMQX 6.3.2 com banco simulado, queda e reinício; compilação receptor S3/TLS e transmissor C3 no core ESP32 3.3.11. Receptor também compilado para ESP32 clássico com TLS. Smoke test de treinamento TensorFlow adicionado, mas não executado: download da dependência permaneceu sem progresso e foi interrompido (14 testes Python aprovados, 1 ignorado por ausência de TensorFlow). Diagnóstico sem autenticação: endpoint remoto atual do worker usa mqtts na porta 1883 e encerrou o handshake TLS; .env preservado, listener/configuração remotos não verificados. `git diff --check` sem erros. **Pendente:** provisionar EMQX Cloud, aplicar migração em staging/produção, ensaiar hardware/rede e Supabase real, coletar histórico e validar modelo; integração visual dos hábitos. Apenas arquivos locais: sem commit, push, PR ou merge. Ver `docs/iot/HABITOS.md`.

> **Integração IoT — 16/11/2026, branch `backend-iot` (base dev `8b241f5`):** adicionados firmware genérico Arduino para transmissor/receptor ESP-NOW → MQTT v1 QoS1, fila LittleFS, cabeçalho de identidade, processamento Python de trilateração derivado do MVP, treinamento/inferência GRU com posição atual/futura e comportamento, jobs SQL duráveis e endpoints autenticados `/api/iot/localizacoes`, `/api/iot/predicoes`, `/api/iot/receptores/coordenadas` (GET/PUT). Tipos em `shared/index.ts`. Sem horário, ingestão não atribui vínculo/zona atuais. Migração aditiva preparada, não aplicada ao Supabase real. Frontend preservado; integração de novos componentes fica com o backend/frontend responsável. Documentação em `iot/README.md`, `firmware/README.md` e `docs/iot/`. **Verificado:** 25 testes backend, typecheck, build/lint frontend, 10 testes Python incluindo PostgreSQL 17/RLS, smoke test TensorFlow 2.21 e compilação C3/S3/ESP32+OLED (core 3.0.7). **Pendente:** hardware físico, campo, modelo com dados reais e configuração operacional. Captura offline usa filas; coordenadas/GRU aguardam sincronização PostgreSQL. Ver `docs/iot/VALIDACAO.md`.

# STATUS_DESENVOLVIMENTO.md — Argos

## Navegação e acesso pelo navegador

Login por e-mail e senha, retorno à rota solicitada, restauração da sessão, saída e navegação desktop e mobile implementados. O início consulta o resumo real e as telas de animais, receptores e alertas listam registros da propriedade pela API. Perfil exibe o e-mail. Configurações aguarda a tela definitiva e a galeria de exemplos fica em `#/demonstracao`. O [guia do frontend](frontend/README.md) descreve as variáveis públicas e os comandos. Build, lint e ensaio em Chrome com conta temporária, API Express e Supabase real validados em 13/11/2026.

## Estado do backend na dev após o PR #10

Cadastros, ingestão MQTT, fila SQLite, sincronização automática, histórico filtrado, resumo por zona, comunicação observada dos receptores, pesagens, CSV e avisos operacionais estão integrados. A retenção tem prévia por propriedade e prazo de referência aprovado de **90 dias**, contado da chegada ao PostgreSQL. A limpeza automática e a consolidação continuam pendentes.

| Frente | Próxima verificação |
|---|---|
| Backend para a apresentação | Repetir o [ensaio pelo terminal](backend/README.md#ensaio-de-monitoramento-pelo-terminal) no notebook do ginásio. Testar também uma interrupção da internet mantendo o broker acessível na rede local, reiniciar o worker e conferir a sincronização sem duplicatas. |
| Telas | Consumir os [contratos HTTP](backend/README.md#contrato-http) com JWT. Conferir em conjunto que dois receptores lendo o mesmo animal resultam em uma cabeça no resumo. |
| ESP32 | Provisionar os IDs dos cadastros e testar uma placa com o [contrato MQTT v1](backend/README.md#contrato-mqtt-v1), inclusive a retransmissão com o mesmo identificador de evento. |
| ML e retenção | Usar a exportação para combinar os campos e a granularidade necessários ao treino antes de ativar descarte. Preservar a última posição conhecida e o histórico consolidado ao implementar a retenção. |

Os registros datados abaixo descrevem cada etapa na época em que foi executada.

> **13/11/2026 — pesagens manuais.** Implementados registro diário por animal e consulta autenticada por período com ganho médio diário. Migração 20261113155333 aplicada no projeto Supabase. O contrato está em `@argos/shared`. Integração visual pendente.

> **12/11/2026 — ensaio do backend pelo terminal.** `pnpm --dir backend ensaio` validado com EMQX em Docker, SQLite, API Express e Supabase real. Dois receptores simulados e uma retransmissão resultaram em duas leituras, um animal contado e comunicação recente em ambos os receptores. Verificação de tipos e 20 testes do backend aprovados. O ensaio com ESP32 físico segue pendente.

> **12/11/2026 — comunicação dos receptores.** O PR #6 já entrou na dev. A rota autenticada `GET /api/monitoramento/receptores` lista a última comunicação sincronizada dos receptores da propriedade e diferencia primeira leitura pendente, leitura recente e ausência de leitura recente. Reutiliza o campo de comunicação existente e a paginação dos dispositivos. Verificação de tipos, 20 testes do backend e ensaio HTTP com duas propriedades temporárias no Supabase aprovados.

> **12/11/2026 — monitoramento por zona.** O histórico do PR #5 foi integrado à dev. A nova rota autenticada `GET /api/monitoramento/resumo` consolida os animais ativos por zona com janela de 2 segundos para RSSI e 5 minutos para recência. Migração aplicada no Supabase. Verificação de tipos, 20 testes do backend e teste de integração do resumo com duas propriedades aprovados. O frontend pode consumir o contrato em `@argos/shared`.

> **12/11/2026 — histórico de detecções para revisão em dev.** Implementada a rota autenticada `GET /api/deteccoes` com paginação e filtros por animal, zona e período. Migração 20261112165455 aplicada no Supabase do Argos. A primeira recepção pelo gateway é preservada inclusive após reinício. Verificação de tipos e 20 testes aprovados. Ensaio com EMQX 6.3.2, interrupção controlada do acesso do worker ao Supabase real, três eventos e uma retransmissão, reinício, transferência de coleira e duas propriedades confirmou deduplicação, vínculo histórico e isolamento pela API e por RLS. Contas temporárias removidas. A contagem consolidada por zona segue planejada.

> **11/11/2026 — backend offline (alteração local na branch lindomar-GPT).** O PR #4 já está integrado à base. O worker MQTT v1 agora persiste as leituras em SQLite antes do PUBACK ao broker e sincroniza as pendências automaticamente. A demonstração usa EMQX alcançável pela rede local. O frontend e o esquema remoto permanecem na versão anterior. Verificação local com Node 24: `pnpm --dir backend typecheck`, `pnpm --dir backend test` (19 testes) e ensaio do worker com EMQX 6.3.2, interrupção do processo, SQLite em arquivo e API HTTP simulada. A etapa offline ainda precisa de ensaio com o Supabase real da apresentação. O roteiro está em `backend/README.md`.

> **Atualização 11/11/2026:** os PRs #2 e #3 estão integrados à `dev` e os cadastros de propriedades, animais, dispositivos, zonas e vínculos foram validados manualmente pelo integrante. A branch `feat/backend-mqtt-ingestion` contém a implementação inicial (em revisão) do **worker MQTT v1**, contrato de detecção, repositório de persistência e testes sem broker. O worker ainda exige credenciais reais de broker e chave secreta de servidor, além de teste ponta a ponta. O firmware não foi modificado; nenhuma regra de dashboard/contagem por RSSI foi implementada. Nenhuma alteração de schema ou registros do Supabase nesta etapa.

---

> **Atualização parcial em 10/11/2026:** o conteúdo abaixo é um retrato histórico de 03/11/2026 e não representa o estado corrente de toda a aplicação. Na branch `dev`, o PR #2 já havia integrado a API de propriedades e animais, as sete tabelas do Supabase e os testes básicos. A branch `feat/backend-devices-zones-links` implementa as rotas autenticadas de **dispositivos, zonas e vínculos**, validações e testes (sem ingestão MQTT); integração à `dev` depende de revisão do novo PR. O CI da branch confirmou `pnpm --dir backend typecheck` e `pnpm --dir backend test` com sucesso. Os testes de cadastro de propriedade/animal foram realizados manualmente pelo integrante; os fluxos de dispositivo/zona/vínculo ainda requerem testes manuais com JWT válido antes do merge. Não houve alteração no frontend ou nas tabelas do Supabase nesta etapa.

---

> **Data da verificação:** 03/11/2026  
> **Repositório:** https://github.com/R-mulus/Argos  
> **Branch inspecionada:** `lindomar-GPT`  
> **Fonte:** leitura dos arquivos e listagem de diretórios no GitHub; complementos informados durante o desenvolvimento com ChatGPT.  
> **Importante:** este inventário registra **o estado observado**, não comprova execução ou compilação de todo o projeto.

## 1. Resumo executivo

O Argos possui um **monorepo inicial** com frontend React/TypeScript, backend Express/TypeScript e pacote compartilhado. A interface de produção e a API de negócio **ainda não estão implementadas no código consultado**. Foram criados diversos componentes isolados em conversas com ChatGPT, mas **eles não aparecem versionados na branch verificada**.

**Não tratar protótipos de Figma, exemplos com dados simulados ou arquivos para download da conversa como funcionalidades já integradas à aplicação.**

### Branches observadas

| Branch | Commit observado | Observação |
|---|---|---|
| `main` | `ee6e78d33` | Mais antiga em relação à base de desenvolvimento; não usar automaticamente como referência de recursos novos. |
| `dev` | `3d19a7f51` | Base compartilhada no momento da consulta. |
| `lindomar-GPT` | `3d19a7f51` | Mesmo commit de `dev` na verificação; **os componentes recentes ainda não constam do GitHub**. |

> Os commits podem mudar a qualquer momento. Atualize esta tabela quando for sincronizar o trabalho dos colegas.

## 2. Estado por área do sistema

| Área | Situação verificada | Evidência / observação | Próximo passo |
|---|---|---|---|
| Monorepo | **Estrutura existente** | `frontend/`, `backend/`, `shared/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Manter configuração e contratos compartilhados coerentes. |
| Frontend — base | **Estrutura existente** | React + TS + Vite; `frontend/src/App.tsx` usa `Routes`, `QueryClientProvider` e `Toaster` | Desenvolver e integrar as páginas reais. |
| Rotas | **Parciais** | Rotas declaradas: `/`, `/auth`, `/vite` | Criar rotas apenas quando as páginas correspondentes existirem. |
| Páginas de usuário | **Placeholders** | `Home.tsx`, `Auth.tsx` e `Animals.tsx` mostram títulos simples; `Animals.tsx` não está ligado às rotas de `App.tsx` | Implementar telas e conectá-las ao roteador. |
| Navegação | **Componente existente** | `frontend/src/components/custom/Navbar.tsx` | Verificar comportamento contra as rotas realmente implementadas. |
| UI de base | **Componentes disponíveis** | `frontend/src/components/ui/` inclui `card`, `chart`, `calendar`, `table`, `select`, `dropdown-menu`, `toggle-group` etc. | Reutilizar Base UI; instalar `popover` apenas se ainda estiver ausente da branch de trabalho. |
| Backend | **Inicial, com endpoint de teste** | `backend/src/server.ts`: `GET /` responde `API do Argos está rodando!`; ainda sem endpoints de negócio | Definir API e regras MVC, ingestão, consultas e autenticação apropriadas. |
| Integração com Supabase | **Planejada / não comprovada** | Dependência `@supabase/supabase-js` presente, mas fluxo de dados fim a fim não verificado | Configurar e validar ambiente, schema, autenticação e permissões por propriedade. |
| Banco de dados | **Schema não verificado** | `shared/index.ts` ainda é um exemplo simples (`NOME_DO_APP`) | Inspecionar o esquema real antes de criar tipos e contratos. |
| Hardware ESP32 | **Protótipo físico reportado pelo integrante; fora do repositório inspecionado** | Integrante relatou que os ESP32 já exibem dados reais e existe um HTML de testes com mocks | Versionar documentação/firmware e validar protocolo/ingestão com a API. |
| Localização por zonas / RSSI | **Planejada** | Definida no contexto e ERS; sem fluxo ponta a ponta demonstrado no código inspecionado | Definir algoritmo e regra de atualização de última zona e status fora de alcance. |
| ML GRU | **Planejado** | Não foi verificada implementação integrada ao frontend/backend | Definir dados de entrada, pipeline, treino, avaliação e integração. |
| Exportação CSV/XLSX | **Proposta em componente separado** | Requisito RF07; não existe uma tela de histórico integrada na branch inspecionada | Integrar, validar formatos e filtros; confirmar dependências. |
| Testes automatizados/CI | **Não verificados** | Não há evidência de execução de build/lint em ambiente de integração nesta inspeção | Executar comandos, registrar falhas e estabelecer validação em PR. |

## 3. Componentes criados fora do repositório

Ao longo das conversas foram **entregues arquivos TSX/ZIP para inclusão manual**, geralmente com dados simulados. A tabela abaixo é um **inventário de entregas da conversa**, não uma confirmação de código presente no GitHub ou de integração funcional.

| Nome entregue / referência | Função prevista | Situação em 03/11/2026 |
|---|---|---|
| `relatorio-processamento-imagens.tsx` | Métricas de processamento de imagens | Entregue fora do GitHub; não verificado em build real |
| `analises-modelo.tsx` | Indicadores do modelo GRU | Entregue fora do GitHub; não verificado em build real |
| `receptor-card.tsx` | Status e métricas de receptor | Entregue fora do GitHub; não verificado em build real |
| `status-indicator.tsx` | Círculo de status Online/Offline | Entregue fora do GitHub; não verificado em build real |
| `analise-geral.tsx` | Indicadores gerais de grupo | Entregue fora do GitHub; não verificado em build real |
| `receptor-resumo-card.tsx` | Card compacto de receptor | Entregue fora do GitHub; não verificado em build real |
| `signal-strength-indicator.tsx` | Barras de força de sinal RSSI | Entregue fora do GitHub; não verificado em build real |
| `DistribuicaoComportamento.tsx` | Porcentagens de padrões comportamentais | Entregue fora do GitHub; não verificado em build real |
| `IndicadorComportamento.tsx` | Barras segmentadas para comportamento | Entregue fora do GitHub; não verificado em build real |
| `CartaoAlerta.tsx` | Card de alerta | Entregue fora do GitHub; não verificado em build real |
| `CalendarioIntervalo.tsx` | Calendário com seleção de intervalo | Entregue fora do GitHub; não verificado em build real |
| `SeletorIntervaloDatas.tsx` | Botão com Popover de seleção de intervalo | Entregue fora do GitHub; não verificado em build real |
| `SeletorPeriodo.tsx` | Seleção Dia/Semana/Mês | Entregue fora do GitHub; não verificado em build real |
| `DadosProcessadosDia.tsx` | Quantidade diária de registros | Entregue fora do GitHub; não verificado em build real |
| `TemperaturaMedia.tsx` | Indicador de temperatura média | Entregue fora do GitHub; não verificado em build real |
| `ContabilizacaoCabecasMes.tsx` | Gráfico Real x Ideal por mês | Entregue fora do GitHub; não verificado em build real |
| `MediaMovimentacao.tsx` | Gráfico comparativo de movimentação | Entregue fora do GitHub; não verificado em build real |
| `QuantidadeCabecas.tsx` | Rosca de animais por setor | Entregue fora do GitHub; não verificado em build real |
| `ResumoCurral.tsx` | Resumo do curral com foto de fundo | Entregue fora do GitHub; não verificado em build real |
| `HistoricoLeitura.tsx` | Tabela com filtros, paginação e exportação | Entregue fora do GitHub; não verificado em build real |

> **Atenção:** há arquivos antigos com nomes em minúsculas/kebab-case. O padrão desejado para **novos** arquivos customizados é português e PascalCase. Renomeações dos antigos dependem de atualizar todos os imports.
>
> **Arquivos de download não são commits:** antes de considerar qualquer item como implementado, copiar os arquivos ao projeto, instalar dependências, testar, fazer commit/push e revisar o PR.

## 4. Fluxo funcional esperado (requisitos, não estado implementado)

| Requisito | Descrição curta | Situação na aplicação verificada |
|---|---|---|
| RF01 | Cadastro de propriedade e animais | Não implementado / não verificado |
| RF02 | Cadastro de dispositivos | Não implementado / não verificado |
| RF03 | Dashboard e monitoramento geral | Página placeholder; cards isolados fora do repositório |
| RF04 | Rastreamento por zonas de detecção | Não implementado / não verificado |
| RF05 | Estatísticas e histórico | Gráficos e tabela entregues separadamente; sem integração de dados verificada |
| RF06 | Alertas | Card isolado entregue; central funcional não verificada |
| RF07 | Exportação de dados | Proposta no `HistoricoLeitura`, fora do repositório verificado |

Referências: `ARGOS_CONTEXT.md` e Documento de Especificação de Requisitos de Software da equipe. Há diferenças antigas entre GPS/RFID e o desenho atual ESP32/RSSI por zonas: **prevalece a arquitetura atual descrita no contexto do projeto**.

## 5. Convenções decididas durante a implementação de componentes

- Componentes customizados em **português e PascalCase**; arquivos do shadcn/ui mantêm nomes de origem.
- `Card` de bordas arredondadas padrão para indicadores comuns; visual e tokens do Argos (`Outfit Variable`, `bg-primary`, `bg-card`, etc.).
- Apenas tema claro por enquanto.
- **Responsividade pelo tamanho do componente:** reduzir fontes, ícones e espaçamentos, além de reorganizar colunas; cards ocupam frações do dashboard.
- Dados simulados por padrão, com **props tipadas** para futura API. Não apresentar mocks como dados reais.
- Gráficos: Recharts + `chart.tsx`, tooltip, e rolagem horizontal quando necessário.
- Histórico de leitura: campos associados a **receptor, zona e RSSI** em vez de GPS/distância exata; filtros e exportação de registros filtrados.
- `QuantidadeCabecas`: total soma os registros por zona; backend deve garantir que o mesmo animal não seja contado simultaneamente em mais de um setor.
- `ResumoCurral`: imagem de fundo configurável; atualização real só quando houver função/API; alerta prioritário, com desempate por data mais recente.

## 6. Pendências técnicas prioritárias

1. **Importar e integrar os componentes no repositório** e conferir se compilam com as versões instaladas; resolver incompatibilidades antes de dar por concluídos.
2. Corrigir eventuais conflitos entre componentes de diferentes entregas, dependências de `Popover`/exportação XLSX e convenções de props.
3. Implementar as páginas e conectar as rotas reais; não criar links para rotas inexistentes.
4. Projetar e implementar endpoints de negócio, esquemas e integrações seguras com Supabase.
5. Definir o protocolo de comunicação ESP32, o formato dos pacotes e a estratégia para detecções duplicadas, dados atrasados e ausência de sinal.
6. Determinar a regra de associação de um animal a **uma** zona no instante da contagem, separando total cadastrado de total detectado.
7. Preparar testes e demonstração com dados simulados rotulados e depois com dados reais.
8. Atualizar `.gitignore` para ignorar explicitamente `.env` e `.env.*`, preservando `.env.example` (validar se já existe outro mecanismo de proteção antes do commit).
9. Revisar e retirar a referência a **RFID UHF** do comentário de TODO em `backend/src/server.ts`, que contradiz a arquitetura ESP32/RSSI.
10. Consolidar documentação e identificar responsáveis por cada tarefa antes de abrir PRs.

## 7. Como atualizar este documento após um PR

Ao integrar uma funcionalidade, faça as quatro ações:

1. Troque o estado de `não verificado` para `implementado` **somente após inspecionar o código e executar a verificação necessária**.
2. Especifique **branch/PR/commit**, arquivos principais, rota ou endpoint e comportamento efetivo.
3. Registre dependências e requisitos de configuração necessários (sem credenciais reais).
4. Descreva testes executados (`pnpm build`, `pnpm lint`, teste manual) e as limitações remanescentes.

### Registro de alterações (preencher pela equipe)

| Data | Responsável | Branch / PR | Mudança realizada | Validação executada |
|---|---|---|---|---|
| 03/11/2026 | Documento inicial (consulta ao GitHub) | `lindomar-GPT` (`3d19a7f51`) | Inventário do estado e das entregas ainda não publicadas | Leitura de arquivos e listagens; **sem build** |

## 8. Guia rápido para novos integrantes

1. Clone o repositório e crie sua branch a partir de `dev` (ou da branch-base acertada com a equipe).
2. Leia `AGENTS.md`, `README.md` e `ARGOS_CONTEXT.md`.
3. Confirme se os componentes mencionados aqui **já foram commitados**; não confie apenas no inventário da conversa.
4. Instale dependências via `pnpm` e execute o projeto conforme `README.md` / `.vscode/tasks.json`.
5. Defina um escopo pequeno e combine quais arquivos serão de sua responsabilidade.
6. Ao concluir, execute as verificações, atualize este documento e abra PR para revisão.

> **13/11/2026 — exportação CSV.** Rota autenticada de exportação de todo o histórico filtrado, com consulta consistente e isolamento por propriedade. Migração aplicada no Supabase. Verificação de tipos, 21 testes locais e integração com mais de mil leituras temporárias aprovados. Arquivos gerados em memória para o volume da demonstração.

> **13/11/2026 — central de avisos operacionais.** Rotas autenticadas para listar avisos e marcar leitura ou resolução. O worker registra uma ocorrência por evento rejeitado de receptor cadastrado. Replays preservam o aviso original. Migração aplicada no Supabase. Verificação de tipos e ensaio com duas contas temporárias confirmaram isolamento, idempotência, concorrência e recuperação de falha na gravação do aviso. Avisos de sincronização de lote e heartbeat seguem planejados.

> **13/11/2026 — aviso de recuperação da sincronização.** Lotes duráveis em SQLite registram a interrupção observada por propriedade e a conclusão do processamento. A central recebe uma ocorrência por lote, com confirmadas e rejeitadas, preservada em replays após reinício. Verificação de tipos, 22 testes locais e integração com duas propriedades no Supabase aprovados. Sem migração remota nova. A central do PR #8 foi reaplicada nesta branch porque seu merge anterior entrou na branch do PR #7 após a integração desta à dev.

> **13/11/2026 — prévia de retenção.** Rota autenticada `GET /api/deteccoes/retencao?dias=90` calcula leituras elegíveis, preservadas e animais que perderiam todo o histórico vinculado. O corte da simulação usa a chegada ao PostgreSQL para preservar sincronizações recentes. Migração aplicada. Verificação de tipos, 23 testes locais e integração com duas propriedades, comparação de 90/180 dias e leitura atrasada aprovados. O responsável aprovou 90 dias como referência para detecções brutas. A execução da limpeza e a consolidação seguem planejadas, considerando o ML e a última posição conhecida.

> **13/11/2026 — componentes preparados para a API.** A Home fornece os exemplos explicitamente aos cards de alerta, curral, contagem, receptores e histórico. A página que fizer a consulta poderá passar o alerta (ou `null`), cada item de comunicação e as zonas de `ResumoMonitoramento` com `recentesSemZona={resumo.recentes_sem_zona}`. Para o histórico, use `dados={leituras.map(registroDeDeteccao)}`. A tabela filtra e pagina as linhas carregadas; a exportação local exige habilitação explícita para um conjunto completo. A exportação integral por consulta está em `GET /api/deteccoes/exportar`. O resumo de curral aceita métricas parciais e o botão de atualização recebe `aoAtualizar` da página. A integração HTTP e o login visual continuam pendentes. Build e lint do frontend aprovados.

> **15/11/2026 — redesign da autenticação.** A rota `/auth` recebeu painel institucional, formulário responsivo, abertura animada com o símbolo oficial e suporte a `prefers-reduced-motion`. O login com Supabase, o retorno à rota solicitada e o tratamento de erros foram preservados. A tela ganhou um controle acessível de visibilidade da senha. `pnpm --dir frontend build` e `pnpm --dir frontend lint` passaram em uma cópia Linux com instalação limpa a partir do lockfile. O Vite emitiu aviso de chunks acima de 500 kB. O usuário realizou a validação visual e funcional no localhost.

> **16/11/2026 — tela inicial fiel ao Figma, alteração local em `feat/mateus-tela-inicial`.** Branch criada a partir de `feat/bernardo-des` (inclui o commit do login do Bernardo, ainda fora da `dev`). `Monitoramento.tsx` foi remontado sobre a imagem do frame “Teste Tela” a 1920 px: margens de 67 px, espaço de 27 px entre cards e alturas do Figma (200, 268/565, 384, 420 e 328 px), com diferença de até 5 px na posição vertical das seções. Textos explicativos, rótulos acima dos cards e o botão Atualizar foram retirados; os avisos de erro e de dados antigos aparecem somente quando ocorrem.
>
> **Dados reais:** "Dados Processados por dia" mostra as leituras de hoje e a média diária do intervalo escolhido (`count` de `GET /api/deteccoes`). Os cards de zona usam o resumo reconciliado; "Receptores Ativos" cruza `GET /api/zonas` (um receptor por zona) com a comunicação dos receptores, e "Coleiras Ativas" conta as coleiras vinculadas detectadas na zona nos últimos 5 minutos. O Animal em Destaque é o primeiro animal recente por identificação, com idade, sexo e raça do cadastro, a última pesagem manual e a última detecção. O RSSI do receptor vem da última leitura da sua zona recebida por ele nos últimos 5 minutos. Bateria e modelo do receptor não têm fonte e aparecem como indisponíveis. A linha ao lado de "Análise Geral" distingue animais recentes, desatualizados, sem horário e nunca detectados.
>
> **Simulados com selo "Simulado":** temperatura, liderança/movimento/distância do destaque, os quatro cards de processamento de imagens, a contagem mensal (Jan–Out) e a movimentação.
>
> **Componentes:** o token `--secondary` (e os que usam o mesmo valor) passou de `#754F36` para o `#503723` do Figma, afetando o app inteiro. `TemperaturaMedia` e `DadosProcessadosDia` tinham a altura mínima e o título dependentes de container queries no próprio container; a altura foi movida para o conteúdo e o título consulta o container nomeado `card`. `IndicadorStatus` usa o verde do Figma (`#0AA146`). A navbar segue a ordem Perfil, Configurações, Sair. Novos: `SeloSimulado` e `lib/fonteInicio.ts` (consultas da tela). `AnimalDestaque` e `CartaoZona` passaram a receber props tipadas.
>
> **Validação:** `pnpm build` (aviso conhecido de chunks acima de 500 kB) e `pnpm lint` aprovados; `node verificar-inicio.mjs` aprovado nos cinco cenários. Prévia `#/demonstracao/inicio?cenario=` conferida no Chromium a 1920, 1440, 1280 e 390 px, nos cenários com dados, vazio, erro, carregando e desatualizado. **Pendente:** ensaio autenticado com a API e o Supabase reais. Sem commit, push ou PR.

> **16/11/2026 — tela Animais por zona, alteração local em `feat/mateus-tela-inicial`.** A rota `/animals` passou a reproduzir o frame “Visão Geral - Curral 03” (`AnimaisZona.tsx`), com seletor de zona no título (`?zona=<id>`). Os cards de zona do Início abrem essa tela. **Dados reais:** animais, receptores e coleiras da zona, animal em destaque da zona, alerta prioritário (avisos novos ligados a animais da zona ou ao seu receptor), animais sem detecção recente cuja última posição foi a zona e o histórico do período filtrado por zona. A tabela carrega todas as páginas até 2.000 leituras, para que filtros e ordenação locais sejam corretos; acima disso, informa o total e a exportação "período completo" usa `GET /api/deteccoes/exportar`. **Decisões com o integrante:** o card "Animais Fora da Área de Cobertura" virou "Animais Sem Detecção Recente" (sem geofence); o mapa é uma ilustração estática com zoom e selo; a tabela usa zona, receptor, RSSI e bateria da coleira em vez de coordenadas, distância, precisão e categoria. **Simulados com selo:** Intervalo entre dados e Precisão do banner, Análise Geral (grupo/coesão), Distribuição de Comportamento, métricas de liderança do destaque e a série do gráfico de animais sem detecção. O cadastro não tem nome de animal ("—").
>
> **Componentes:** novos `AnimaisSemDeteccao`, `MapaIlustrativoZona` e `EstadoConsulta` (estados de carregamento, erro e dados antigos compartilhados); `lib/monitoramento.ts` reúne regras comuns e `lib/fonteMonitoramento.ts` substitui `fonteInicio.ts`. `HistoricoLeitura` ganhou `exibirComportamento` e `exportacaoCompleta`, mostra o nome da área e a identificação do animal (o adaptador usava o UUID) e abrevia IDs longos. `AnaliseGeral` aceita ficar sem `detailsPath`. `sessao.ts` ganhou `baixarDaApi` para downloads autenticados.
>
> **Validação:** build, lint e `node verificar-inicio.mjs` aprovados; prévia `#/demonstracao/animais?cenario=` conferida no Chromium a 1920, 1440 e 390 px nos cenários com dados, vazio, erro e desatualizado. **Pendente:** ensaio autenticado com a API real. Sem commit, push ou PR.

> **16/11/2026 — tela Receptores, alteração local em `feat/mateus-tela-inicial`.** A rota `/receptores` (`ReceptoresZona.tsx`) reproduz o frame “Status Receptores”, com o mesmo seletor de zona da tela Animais (`?zona=<id>`) para o banner e o mapa. Os cards grandes (`ReceptorCard`) mostram todos os receptores, quatro por página; os pequenos (`ReceptorResumoCard`) listam todos e, ao clicar, abrem a página do card grande correspondente. **Dados reais:** comunicação, RSSI da última leitura da zona recebida pelo receptor nos últimos 5 minutos e, no período escolhido, registros por dia, intervalo médio entre leituras e perdas de sinal (lacunas maiores que 5 minutos, incluindo o silêncio até o fim do período). O cálculo usa até 2.000 leituras por receptor e avisa quando é parcial. A frase do card vem do estado de comunicação. Modelo e bateria do receptor não têm fonte ("—"). **Simulado com selo:** Análises do Modelo (GRU não integrado). O mapa ilustrativo mostra o receptor da zona com a cor da comunicação (um receptor por zona, não os quatro cantos do Figma).
>
> **Componentes:** novos `CabecalhoZona`, `ResumoZona`, `hooks/useMonitoramento.ts` (relógio, período e consultas por zona, compartilhados com Animais) e `lib/historico.ts` (busca paginada, download e métricas do receptor). `ReceptorCard` aceita `mensagem` e mostra decimais em pt-BR; `AnalisesModelo` aceita ficar sem `detailsPath`; `MapaIlustrativoZona` aceita o marcador de receptor. A lista simples de receptores (`Listagem`) segue em uso apenas em Alertas.
>
> **Validação:** build, lint e `node verificar-inicio.mjs` aprovados; prévia `#/demonstracao/receptores?cenario=` conferida no Chromium a 1920, 1440 e 390 px. **Pendente:** ensaio autenticado com a API real. Sem commit, push ou PR.

> **16/11/2026 — correções após o print da tela Receptores com dados reais.** `ui/card.tsx` (shadcn): o `CardHeader` deixou de declarar `@container/card-header`, que fazia títulos e ícones de ~10 componentes consultarem a largura do cabeçalho em vez da do card. `ResumoCurral`: grade interna refeita como no Figma (número recuado e colunas agrupadas, 176/177/317 px em 1920 px), altura de 384 px e camada escura mais leve; mesmas props. `MainLayout`: fundo branco e espaço superior em todas as telas autenticadas, não só no Início. `Navbar`: todos os itens ativos usam o fundo bege do Início (o fundo quase preto deixava o texto ilegível). `ReceptorCard`: intervalos longos em horas ou dias ("3 d 11 h"). `AnalisesModelo`: layout de duas colunas de cabeçalho e quatro de métricas a partir de 620 px de card (antes, 760). Receptores: os cards pequenos só aparecem com mais de quatro receptores; até quatro, Análises do Modelo ocupa a largura toda. Build, lint e `node verificar-inicio.mjs` aprovados; Início, Animais e Receptores conferidos no Chromium a 1920, 1484 e 390 px. Sem commit.

> **16/11/2026 — Central de Alertas, alteração local em `feat/mateus-tela-inicial`.** Sem frame no Figma; a tela segue a identidade das demais (cards com aba colorida, pílulas de filtro, títulos de 30 px, fundo branco). A rota `/alertas` (`pages/Alertas.tsx`) substitui a lista simples. **Dados reais:** contagens por estado (`GET /api/alertas?estado=`), avisos novos de prioridade alta ou crítica, lista paginada no servidor (10 por página) com filtro Todos/Novos/Lidos/Resolvidos, e as ações "Marcar como lido" e "Resolver" (`PATCH /api/alertas/:id`), com bloqueio de envio duplicado, aviso de sucesso ou falha e atualização do cache (inclusive do alerta prioritário dos banners). **Componentes novos:** `IndicadorAlertas`, `ItemAlerta` (prioridade na aba lateral, estado, tipo e data de resolução) e `SeletorEstadoAlerta`. `sessao.ts` ganhou `enviarApi` para POST e PATCH. `pages/Listagem.tsx` ficou sem uso e pode ser removido. Build, lint e `node verificar-inicio.mjs` aprovados; prévia `#/demonstracao/alertas?cenario=` conferida no Chromium a 1484 e 390 px, incluindo as ações, vazio e erro. **Pendente:** ensaio autenticado com a API real. Sem commit.

> **16/11/2026 — cadastros em Configurações e limpeza de branches.** `/configuracoes` (`pages/Configuracoes.tsx`) passou a reunir os cadastros, em abas (`?aba=zonas|dispositivos|vinculos`), sem frame no Figma e com a identidade das demais telas. **Zonas:** criar, editar, ativar e desativar; seletor de receptor que impede usar um receptor de outra zona; zona ativa exige receptor; aviso sobre o efeito de editar zona ativa nas leituras atrasadas. **Dispositivos:** coleiras e receptores, com filtro por tipo, uso atual (zona do receptor ou animal da coleira), criação, edição (o tipo é imutável) e ativação. **Vínculos:** ativos e histórico, criação apenas com animais e coleiras ativos e livres, e encerramento com confirmação. Validação nos formulários, bloqueio de envio duplicado, mensagens de sucesso e erro (inclusive os conflitos da API) e atualização do cache dos cadastros e das telas de monitoramento. **Componentes novos:** `SeletorPilulas`, `SeloStatus`, `TabelaCadastro`, `PainelFormulario` e `CampoFormulario`; dados em `lib/cadastros.ts` e `hooks/useCadastros.ts`. Build, lint e `node verificar-inicio.mjs` aprovados; prévia `#/demonstracao/configuracoes` testada no Chromium (criar zona com validação, filtros, encerrar vínculo) a 1484 e 390 px. **Pendente:** ensaio autenticado e cadastros de animais, pesagens e propriedade.
>
> **Branches:** removidas localmente as 12 branches já integradas à `dev` (9 `codex/*` e 3 `feat/backend-*`); `codex/central-avisos` e `codex/comunicacao-receptores` têm conteúdo idêntico ao commit c18832f da `dev`. A remoção no GitHub das 9 `codex/*` não pôde ser feita deste ambiente (push bloqueado) e fica para o integrante. `lindomar-GPT`, `main`, `dev` e `feat/bernardo-des` foram mantidas.

> **16/11/2026 — cadastro de animais e pesagens.** Nova aba Animais em Configurações (`pages/cadastros/Animais.tsx`): busca por identificação, raça ou lote; filtro Ativos/Inativos/Todos; coluna da coleira vinculada; criação e edição com identificação obrigatória, sexo, raça, categoria, nascimento (não futuro), lote, origem e observações; desativação e reativação, sem exclusão. O painel Pesagens lista até 100 registros com o ganho médio diário da API e registra novas pesagens (data até hoje, peso positivo em kg, aceita vírgula), exibindo o conflito de pesagem repetida no mesmo dia. `lib/formatos.ts` concentra idade, data e peso (o `AnimalDestaque` passou a usá-lo). Os campos dos painéis ganharam contorno visível (o token `--input` é branco) e alinhamento corrigido. Build, lint e `node verificar-inicio.mjs` aprovados; prévia testada no Chromium (busca, validação, pesagem válida, pesagem repetida e identificação duplicada). **Pendente:** ensaio autenticado; primeiro acesso (propriedade) e Perfil.

> **16/11/2026 — primeiro acesso e Perfil.** A área autenticada passa por `layouts/GuardaPropriedade.tsx`: sem propriedade (`GET /api/propriedades/minha` com 404), o usuário vê `PrimeiroAcesso` (nome obrigatório, município e UF), e ao cadastrar segue para Configurações › Dispositivos, com os próximos passos listados. `/perfil` (`pages/Perfil.tsx`) mostra a conta (e-mail, último acesso, criação e botão Sair), a propriedade com edição (`PATCH /propriedades/minha`) e o resumo de animais, coleiras, receptores e zonas ativos, com atalhos para cada aba de Configurações. `sessao.ts` passou a lançar `ErroApi` com o status HTTP e o código. `IndicadorAlertas` foi renomeado para `IndicadorResumo` (genérico). Novos: `CamposPropriedade` e `lib/propriedade.ts`; `CampoFormulario` aplica o contorno dos campos em qualquer formulário. Build, lint e `node verificar-inicio.mjs` aprovados; prévias `#/demonstracao/perfil` e `#/demonstracao/primeiro-acesso` testadas no Chromium (validação, edição, cadastro e redirecionamento) a 1484 e 390 px. **Pendente:** ensaio autenticado com a API real, inclusive com uma conta nova sem propriedade.
