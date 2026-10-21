# ARGOS — Contexto do Projeto para IAs

> Arquivo de contexto para assistentes de IA (ChatGPT, Claude, Copilot, Cursor etc.). Leia antes de gerar código, documentação ou sugestões.

> É mencionado várias vezes neste arquivo o fato que não será usado RFID, tags UHF, etc. Isso é para caso seja anexado à conversa os documentos referentes ao projeto, os quais ainda se tinha uma ideia diferente sobre o hardware e arquitetura utilizada. Considere informações deste arquivo como fontes principais.

---

## 0. Regras de ouro (leia primeiro)

1. **NÃO usamos RFID.** O Projeto de Intervenção menciona antenas/tags/leitores RFID, mas isso está **desatualizado/incorreto**. A solução real usa **ESP32 nano** (microcontroladores) como transmissores (nos animais) e receptores (na propriedade). Nunca sugira leitores RFID, tags UHF, brincos RFID, SISBOV via RFID etc.
2. Idioma do produto, documentação e comentários no código: **português do Brasil**. Idioma do código em si: **inglês**
3. Os itens **fora de escopo** (seção 3) não devem ser implementados nem sugeridos como entregáveis.
4. Respeitar as regras de negócio RN01–RN03 e os requisitos RNF01–RNF07 (seções 6 e 7).
5. Em dúvida entre o que dizem os documentos, **priorize o README do projeto e as instruções do usuário** e sinalize a divergência (ver seção 12).
6. Este projeto tem como objetivo principal ser um **projeto acadêmico**.

---

## 1. Visão geral

**Argos** é uma aplicação web (dashboard responsivo) para **monitoramento de rebanhos bovinos** usando IoT + Machine Learning.

- Microcontroladores **ESP32 nano** atuam como **localizadores/transmissores** (acoplados ao animal) e como **receptores** (instalados em pontos da fazenda, como bebedouros, currais e áreas de descanso).
- Os receptores detectam os transmissores, medem a **intensidade do sinal (RSSI)** e enviam as detecções para a **API Argos**.
- O sistema determina em qual **zona de interesse** cada animal está, conta automaticamente as cabeças do rebanho, guarda o histórico de movimentação e aplica **Machine Learning** (modelo GRU) para identificar padrões comportamentais.

**Objetivo (TAP - Termo de Abertura do Projeto):** desenvolver uma aplicação que monitore, identifique e contabilize os animais do rebanho e identifique a posição de cada animal.

**Problema:** pequenos/médios produtores gastam tempo e mão de obra para monitorar e contar o rebanho manualmente, com sujeição a erro humano e sem histórico estruturado.

---

## 2. Contexto acadêmico e parceiro

| Item | Valor |
|---|---|
| Instituição | Centro Universitário de Patos de Minas (UNIPAM) |
| Curso | Sistemas de Informação |
| Disciplina | Projeto Integrador V — Extensão Curricularizada |
| Professor | Me. Eder Manoel de Santana |
| Equipe | Bernardo Willian da Cunha, Mateus Felisberto Xavier Rosa, Matheus Ferreira Rocha Oliveira |
| Cliente/parceiro | Fazenda Manjubinha (validação em campo) |
| Período | 24/08/2026 a 25/11/2026 |
| Cronograma | Ago: tema; Set: locus, diagnóstico, planejamento; Out–Dez: intervenção, análise, redação final |
| Público-alvo | Produtores rurais de pequeno e médio porte; profissionais de TI |

---

## 3. Escopo

**Dentro do escopo**
- Posição de cada animal do rebanho (por zona de detecção)
- Contagem dos animais do rebanho
- Histórico de posição/contagem
- Análise de dados com Machine Learning para decisões de negócio

**Fora do escopo (implementar APENAS se for requisitado explicitamente)**
- Índice de locais com maior movimentação de gado
- Alerta de animal parado por muito tempo
- Alerta de animal que ultrapassa a área da fazenda (geofence)

---

## 4. Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Front-end | React TypeScript + Vite (web responsiva: desktop, tablet, smartphone, desenvolvimento mobile-first) |
| UI | shadcn/ui (**variação Base UI**) + Tailwind CSS |
| Back-end | Express + TypeScript, arquitetura **MVC** |
| BD / Auth | **Supabase** (PostgreSQL, autenticação, storage, APIs automáticas) |
| Hardware / IoT | **ESP32 nano** (transmissor no animal + receptor na fazenda) |
| Machine Learning | Python + TensorFlow, modelo **GRU** (Gated Recurrent Unit) para dados sequenciais |
| Gerenciador de pacotes | **pnpm** |
| Design / Gestão / Versionamento / IDE | Figma / Trello / GitHub / VS Code |

> A "API Argos" que recebe as detecções dos receptores é o **backend Express**.

### 4.1 Estrutura do repositório (monorepo)

```
Argos/
├── frontend/   # React Typescript + Vite
├── backend/    # Express + Typescript (MVC)
└── shared/     # Código compartilhado (ex.: tipos TypeScript das tabelas do banco. Importar pacotes de shared/ utilizando alias configurado no pnpm: @argos/shared)
```

Iniciar servidores: no VS Code, `Ctrl+Shift+P` → "Executar Tarefa"/"Run Task" → **"Iniciar Servidores"** (abre dois terminais: backend e frontend).

### 4.2 Backend

- Express + TypeScript, MVC, usa `@supabase/supabase-js`.
- Bibliotecas (13/10/2026): `@supabase/supabase-js`, `cors`, `dotenv`, `express`, `@types/cors`, `@types/express`, `nodemon`, `tsx` (roda .ts sem compilar), `typescript`.
  - Durante o desenvolvimento podem surgir novas bibliotecas. Quando isso acontecer será notificado.
- Embora a API do Supabase tenha sido pensada para uso direto no frontend (sem API própria), **ela será utilizada no backend para criar a API Argos** (ex: queries ao banco de dados). Regras de negócio e ingestão de dados dos ESP32 devem ficar no backend.
- Instalar dependência: dentro de `backend/`, `pnpm i <biblioteca>`.

### 4.3 Frontend

- React Typescript + Vite; componentes/temas do shadcn/ui; estilização com Tailwind.
- **Autenticação (Auth) é feita pela API do Supabase diretamente no frontend.**
- Bibliotecas (13/10/2026): `@supabase/supabase-js`, `@tailwindcss/vite`, `@tanstack/react-form` (formulários/validação), `@tanstack/react-query` (requisições, cache, estado assíncrono), `@tanstack/react-table` (tabelas), `axios` (HTTP para a API), `cn` (junção de classes Tailwind), `lucide-react` (ícones), `react`, `react-dom`, `react-router-dom` (rotas), `shadcn` (CLI), `tailwindcss`, `tw-animate-css`, `zustand` (estado global).
  - Durante o desenvolvimento podem surgir novas bibliotecas. Quando isso acontecer será notificado.
- **Antes de criar componentes customizados, verifique se o que é necessário existe no shadcn.** Instale sempre pelo comando da documentação mais recente do shadcn **versão Base UI**, dentro de `frontend/`. Ex de instalação de componente.: `pnpm dlx shadcn@latest add accordion`.
  - Se o terminal perguntar se pode **instalar** outros componentes necessários: **Y**.
  - Se perguntar se pode **sobrescrever** componentes existentes: **N** (para não perder alterações feitas por nós).
- Tipos de tabelas do banco vêm de `shared/`. Eventualmente serão armazenadas mais coisas na pasta shared. Quando julgar que tenha algo necessário para se guardar nessa pasta, diga.

---

## 5. Arquitetura lógica

```
[ESP32 nano transmissor]  --(sinal sem fio)-->  [ESP32 nano receptor]
   (1 por animal)                                (por zona: curral, bebedouro...)
                                                        |
                                           (Wi-Fi/internet, HTTPS, buffer local)
                                                        v
                                                  [API Argos]
                                                        |
                                                        v
                                         [Supabase / PostgreSQL]
                                              |               |
                                              v               v
                                  [Dashboard React/TS]   [Pipeline ML (Python/TF/GRU)]
```

Pontos-chave:
- A posição é **aproximada, por zona**, calculada a partir do **RSSI** reportado pelo receptor — não é geolocalização exata.
- Se o animal sai da cobertura de todos os receptores: exibir **última zona conhecida** + status **"Fora de alcance"** até nova detecção.
- Receptores sem internet **armazenam localmente** os pacotes e enviam **em bloco** na reconexão (RN03 / abordagem offline-first).
- O dashboard em instabilidade mostra **dados em cache** com indicador "dados desatualizados/modo offline".

---

## 6. Requisitos funcionais

| ID | Nome | Resumo e regras principais |
|---|---|---|
| RF01 | Cadastro de animais e propriedade | Cadastro de usuário, propriedade e animais (identificação, raça, sexo, nascimento/idade estimada, peso, origem, lote, observações). Identificação **única por propriedade**; atualizações preservam histórico; validação de obrigatórios. |
| RF02 | Cadastro de hardware de rastreio | CRUD de dispositivos IoT (ID de rede, tipo transmissor/receptor, local de instalação). Sem ID de hardware duplicado ativo na propriedade; **transmissor ↔ apenas 1 animal**; teste de conexão (ping) ao cadastrar receptor, com alerta se falhar. |
| RF03 | Dashboard de controle | Quantidade total de animais, distribuição por localização, últimas áreas de detecção. Lista **somente** animais da propriedade do usuário logado; indicadores visuais; atalhos de manejo rápido; responsivo. |
| RF04 | Rastrear animais | Posição atualizada por zona: animal, receptor, data/hora, **RSSI**. Baseado em zonas pré-definidas; posição atualizada e contabilizada quando o receptor envia a detecção via API. |
| RF05 | Estatísticas e histórico | Histórico de movimentação por área, evolução e ganho médio de peso. Filtro por animal e período. **ML** sobre dados sequenciais para padrões comportamentais. |
| RF06 | Alertas | Central de avisos com histórico recente; alertas operacionais (falha de hardware/rede); campos: tipo, animal, data, responsável, descrição; marcar como lido/resolvido. |
| RF07 | Exportar dados | Exportação **.XLSX ou .CSV** respeitando filtros aplicados; colunas tipadas; arquivos grandes: barra de progresso ou link por e-mail. |

### Casos de uso
UC01 Cadastro animais/propriedade · UC02 Cadastro hardware · UC03 Dashboard · UC04 Rastrear em zonas · UC05 Estatísticas/histórico · UC06 Alertas · UC07 Exportar dados (cada UC corresponde ao RF de mesmo número).

---

## 7. Requisitos não funcionais

| ID | Tema | Essência |
|---|---|---|
| RNF01 | Desempenho/latência | Dados mais recentes priorizados; processamento simultâneo de vários dispositivos; nunca exibir dado antigo como atual. |
| RNF02 | Disponibilidade/tolerância a falhas | Queda de comunicação não derruba o sistema; retomada automática; falha de um dispositivo não afeta os demais; erros tratados de forma controlada. |
| RNF03 | Segurança | Autenticação obrigatória; permissões por perfil; credenciais protegidas; comunicação segura (HTTPS/TLS); log de acessos e alterações. |
| RNF04 | Usabilidade | Interface simples, consistente, linguagem clara, destaque visual para atenção/perda de comunicação/dado desatualizado, mensagens de erro orientativas, responsiva. |
| RNF05 | Integridade dos dados de localização | Associar leitura ao dispositivo/animal corretos; validar antes de gravar; registro com origem e timestamp; dado inválido nunca substitui válido; alterar cadastro não corrompe histórico; ordem temporal preservada. |
| RNF06 | Escalabilidade | Suportar mais animais, dispositivos, registros e usuários sem mudança estrutural; histórico crescente. |
| RNF07 | Manutenibilidade/monitoramento | Logs de erros e eventos com origem/momento; atualizações controladas; acompanhamento do estado dos componentes. |

---

## 8. Regras de negócio

- **RN01 — Vínculo IoT:** cada dispositivo físico pareado a **um único animal vivo** (relação 1:1), evitando leituras duplas que corrompam a contagem.
- **RN02 — Retenção de telemetria:** pings brutos de localização têm retenção limitada (ex.: **3 meses**); depois podem ser descartados ou **compactados em relatórios consolidados**, que são vitalícios. Histórico detalhado e exportação respeitam essa janela.
- **RN03 — Conexão intermitente:** receptores sem rede guardam os últimos pacotes localmente e enviam em bloco ao reconectar; o usuário deve ser notificado quando a comunicação ficar intermitente e quando pacotes atrasados forem sincronizados.

---

## 9. Perfis de usuário

- **Administrador do Sistema:** gerencia operadores e usuários, permissões, dispositivos associados às propriedades, consulta logs/ocorrências e estado da plataforma.
- **Usuário do Sistema (produtor):** login vinculado a **uma propriedade**; cadastra/atualiza animais, acompanha localização e histórico, registra/consulta vida sanitária, vê alertas e informações gerais do rebanho.

---

## 10. Modelo de dados (sugestão derivada dos requisitos)

Entidades prováveis (confirmar com o schema real do Supabase que será enviado):
`usuarios`, `propriedades`, `animais`, `dispositivos` (tipo: transmissor|receptor, status: ativo|offline|pendente), `zonas` (local do receptor), `deteccoes` (animal_id, receptor_id, rssi, timestamp, origem), `historico_animal`, `alertas`, `eventos_sanitarios`, `pesagens`, `logs_sistema`.

Restrições importantes: `UNIQUE(propriedade_id, identificacao_animal)`; `UNIQUE` de ID de hardware ativo por propriedade; vínculo transmissor↔animal 1:1; RLS (Row Level Security) do Supabase garantindo isolamento por propriedade.

---

## 11. Machine Learning

- Modelo **GRU** (TensorFlow/Python) sobre séries temporais de movimentação/localização por zona.
- Objetivo: identificar padrões comportamentais do rebanho e possíveis alterações de comportamento para apoiar decisões.
- Métricas de aceite relevantes: taxa de erro aceitável na contagem (comparar com contagem real em campo) e confiabilidade da detecção de localização/mudança de movimento.

---

## 12. Divergências conhecidas entre os documentos (atenção)

1. **RFID × ESP32:** o Projeto de Intervenção cita RFID/leitores UHF/brincos. **Correto: ESP32 nano.** Ignore RFID.
2. **GPS × RSSI/zonas:** a introdução do ERS e o Projeto de Intervenção falam em módulo GPS, enquanto RF04/UC04 definem localização por zonas via RSSI. Tratar a **localização por zona/RSSI** como regra funcional; GPS é, no máximo, complementar. Confirmar no README.
3. **"Tempo real":** o TAP diz "posição em tempo real", mas o critério de aceite admite "atualização compatível com a infraestrutura disponível" (conectividade rural limitada).
4. **Descrição do React (Quadro 1):** o Projeto de Intervenção descreve o React como framework mobile nativo (descrição de React Native). O projeto é uma **aplicação web responsiva** com React + TypeScript + Vite (confirmado no README).
4b. **Backend:** o Projeto de Intervenção não cita o Express; o README define backend Express + TS (MVC) além do Supabase.
5. **Dados sanitários e peso:** aparecem em RF01/RF05 e nos perfis de usuário (vacinas, tratamentos, pesagens). Não há um RF dedicado a registro sanitário; tratar como parte de cadastro/histórico do animal.
6. **Metas de desempenho** (RNF01) são qualitativas ("menor atraso possível"); não há SLAs numéricos definidos.

---

## 13. Riscos e mitigações (TAP)

| Risco | Mitigação |
|---|---|
| Falha do sistema gerar predição incorreta | Testes periódicos, validação de dados, detecção de falhas |
| Lógica de contagem incorreta | Testar com diferentes quantidades/movimentações e comparar com contagem real |
| Imprecisão dos sensores | Testar em condições variadas; validar e tratar dados recebidos |
| Instabilidade de internet | Buffer local no receptor + sincronização na reconexão |
| Atrasos por dificuldades técnicas | Dividir tarefas, priorizar, acompanhamento periódico |

---

## 14. Critérios de aceite

O projeto é aceito se o sistema: identificar os animais monitorados; contar com taxa de erro aceitável para equipe e cliente; mostrar posição em tempo real ou com atualização compatível com a infraestrutura; apresentar dados de forma clara via web; permitir visualização e análise dos dados; operar de forma estável em testes próximos ao ambiente real.

---

## 15. Orientações para IAs ao gerar código ou texto

- Cheque sempre as **documentações mais recentes**.
- Use **TypeScript estrito**; front-end com componentes React funcionais com hooks, layout mobile-first, **shadcn/ui variação Base UI**, Tailwind, TanStack Query/Form/Table, Zustand e React Router **Declarativo**.
- Back-end em Express + TS seguindo **MVC**; tipos de tabelas compartilhados em `shared/`; use `pnpm` (não npm/yarn).
- Não sobrescreva componentes shadcn já customizados.
- No firmware, assuma **ESP32 nano** (Arduino framework/ESP-IDF/PlatformIO). Implemente buffer local de pacotes, reenvio em bloco, tratamento de reconexão e comunicação segura (HTTPS).
- Nunca armazene credenciais em texto puro; use variáveis de ambiente e as políticas RLS do Supabase.
- Valide **toda** detecção recebida (campos obrigatórios, animal/dispositivo existentes, timestamp, RSSI plausível) antes de gravar.
- Exportações: colunas tipadas (datas como data, números como número).
- Textos de interface em português claro, sem jargão técnico desnecessário.
- Não implemente os itens fora de escopo (seção 3).
- Ao encontrar ambiguidade, pergunte ou sinalize em vez de assumir; cite o ID do requisito (RF/RNF/RN/UC) relacionado.
- Ao receber prints do Figma para desenvolvê-los, faça perguntas para extrair o máximo de informações possíveis para evitar retrabalho.
- Priorize o uso das bibliotecas instaladas ao invés de código typescript puro.
- Todo código de componente ou tela deve ser totalmente responsivo para desktop, tablet e celular.
- Resolva problemas de maneira simples ao invés de criar soluções complicadas desenecessárias. Se o bug foi corrigido e está funcionando como é requerido, está satisfatório.

---

## 16. Glossário

**API** – interface de comunicação entre softwares · **Dashboard** – painel de controle de gestão · **IoT** – Internet das Coisas · **ESP32** – microcontrolador com Wi-Fi/Bluetooth · **RSSI** – intensidade do sinal recebido, usada como proxy de proximidade · **Zona de interesse** – área mapeada da fazenda (curral, bebedouro, descanso) associada a um receptor · **GRU** – rede neural recorrente para dados sequenciais · **Latência** – atraso entre envio e disponibilização do dado · **Logs** – registros de eventos do sistema · **Offline-first** – operar sem conexão e sincronizar depois · **Responsividade** – adaptação a diferentes telas.
