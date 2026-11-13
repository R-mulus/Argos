# STATUS_DESENVOLVIMENTO.md — Argos

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
