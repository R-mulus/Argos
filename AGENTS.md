# AGENTS.md — Instruções para assistentes de IA do Argos

> **Projeto:** Argos — monitoramento de rebanhos bovinos por zonas de detecção.  
> **Repositório:** https://github.com/R-mulus/Argos  
> **Última revisão:** 03/11/2026
>
> Este arquivo estabelece as convenções para assistentes de desenvolvimento usados por diferentes integrantes da equipe. **Não confunda requisitos planejados com funcionalidades já implementadas.**

## 1. Antes de qualquer alteração

1. Leia `README.md`, `ARGOS_CONTEXT.md` e `STATUS_DESENVOLVIMENTO.md`.
2. Confira a **branch atual** (`git branch --show-current`), os arquivos realmente existentes e as dependências de cada pacote. Não pressuponha que o conteúdo de conversas com IAs esteja no GitHub.
3. Examine componentes e utilitários existentes antes de criar um novo. Priorize a reutilização e evite duplicações.
4. Consulte a documentação atual das tecnologias envolvidas, sobretudo quando APIs ou versões podem ter mudado.
5. Antes de iniciar funcionalidades com decisões pendentes, faça perguntas objetivas e esclareça regras de negócio. Para tarefas já especificadas, implemente dentro do escopo aprovado.
6. Respeite o trabalho dos colegas: **não altere, renomeie, sobrescreva, remova ou formate arquivos fora do escopo** sem autorização.
7. Não execute `git push`, `merge`, `rebase`, force-push, criação de PR nem commits em nome da equipe sem solicitação explícita.

### Precedência para resolver divergências

1. Solicitação explícita e mais recente do integrante responsável.
2. Código e configurações **efetivamente presentes na branch em uso** (para fatos sobre o que existe/compila).
3. `README.md` e `ARGOS_CONTEXT.md` (para regras e arquitetura do projeto).
4. `STATUS_DESENVOLVIMENTO.md` (inventário que deve ser atualizado após mudanças reais).
5. ERS e outros documentos acadêmicos, observadas as divergências já identificadas.

Se documentos entrarem em conflito, **sinalize a divergência**. Nunca modifique requisitos ou arquitetura silenciosamente.

## 2. Arquitetura e escopo

- **Produto:** aplicação web responsiva para visualização, identificação e contagem de bovinos e seus históricos, com análise comportamental planejada.
- **Localização:** por **zona de interesse** com detecções de ESP32 e RSSI; **não pressupor GPS ou coordenadas precisas**.
- **Hardware:** ESP32 como transmissor acoplado ao animal e receptor em pontos da propriedade; **RFID/UHF não fazem parte da arquitetura atual**. Há referência obsoleta a RFID em um comentário do backend: não reproduza essa decisão antiga.
- **Backend:** Express + TypeScript, organizado conforme MVC à medida que avançar; API própria para regras de negócio e ingestão de dados IoT.
- **Banco/autenticação:** Supabase (PostgreSQL e Auth); autenticação prevista diretamente no frontend.
- **ML:** Python, TensorFlow e GRU **planejados**, não presumir integração pronta.
- **Pacotes:** monorepo com `frontend/`, `backend/` e `shared/`; `shared/` fornece tipos ou contratos realmente compartilhados, via pacote `@argos/shared`.

### Restrições relevantes

- Não propor ou implementar sem solicitação explícita: geofence para animais que saem dos limites da fazenda, alerta de animal parado por muito tempo e índice de áreas com maior movimentação.
- Evitar duplicidade de contagem por animal entre receptores/zonas (RN01). Um gráfico com soma de setores só representa o total corretamente se os registros já tiverem sido reconciliados.
- Diferenciar data de **última detecção**, data de **recebimento** e dados desatualizados. Conectividade rural é intermitente (RN03).
- Não calcular distância física exata a partir do RSSI nem apresentar uma média simulada como dado medido.
- Garantir isolamento de dados por propriedade, validação dos registros e cuidados com credenciais (RNF03 e RNF05).

## 3. Stack e convenções de frontend

- React funcional com hooks, TypeScript e Vite; **React Router no modo declarativo**.
- Tailwind CSS 4; fonte **Outfit Variable**; utilizar variáveis de cor e tokens de `frontend/src/index.css`, evitando cores arbitrárias quando já houver token equivalente.
- **shadcn/ui com Base UI**, não Radix. Procurar o componente pronto antes de escrever um do zero.
- Os arquivos gerados pelo shadcn/ui em `frontend/src/components/ui/` mantêm seus nomes originais; **não os sobrescrever automaticamente** ao instalar outro componente. Em prompts de sobrescrita, a orientação do repositório é escolher **N**.
- **Componentes customizados:** arquivos e funções/exportações principais em **português e PascalCase**, como `ResumoCurral.tsx`, `QuantidadeCabecas.tsx`, `HistoricoLeitura.tsx`; manter os nomes atuais existentes e **não renomear arquivos legados sem atualizar todos os imports**.
- Textos de interface, documentação e comentários em português brasileiro. Variáveis de domínio, props e contratos devem seguir o padrão já presente no módulo, sem misturar nomes arbitrariamente.
- Usar tipos estritos; não introduzir `any` para contornar problemas; props bem tipadas, especialmente dados de API.
- Usar TanStack Query para consulta/cache assíncrono quando a funcionalidade for integrada, TanStack Table na versão **efetivamente instalada** (o pacote do frontend inspecionado declara `^9.2.8`), TanStack Form para formulários quando couber, Zustand apenas para estado realmente compartilhado.
- Preferir dependências existentes; antes de adicionar uma nova, verificar pacote e versão instalada, finalidade e impacto no lockfile.

### Responsividade obrigatória de cada novo componente

- Os cards **ocupam apenas uma fração do dashboard**; dimensionar pelo espaço disponível, não assumir largura de tela inteira.
- Usar abordagem mobile-first e, quando adequado, **container queries**; reduzir em espaços menores: tamanho de fontes, ícones, altura de barras, padding e gaps — não apenas quebrar colunas.
- Para tabelas com muitas colunas, preservar informação com rolagem horizontal; para gráficos, garantir tooltip, acessibilidade dos números e alternativa adequada em tamanhos reduzidos.
- Evitar larguras e alturas fixas que causem sobreposição; texto longo deve quebrar com segurança.
- Suporte a tema claro por enquanto, sem prejudicar os tokens globais.
- Cards comuns utilizam `Card` padrão do shadcn/ui com bordas arredondadas tradicionais; não aplicar `rounded-argos` em todos indiscriminadamente.

## 4. Dados simulados e integração futura

- Enquanto a API de negócio não estiver pronta, componentes podem utilizar **mocks explicitamente identificados**.
- Sempre que apropriado, permitir que componentes recebam `dados` ou propriedades tipadas, sem acoplar consulta HTTP dentro de componentes puramente visuais.
- Não afirmar que o botão de atualizar executa uma requisição real se só houver simulação; não gerar resultados randômicos com aparência de telemetria real.
- Implementar estados de carregamento, erro, vazio e desatualizado quando o fluxo exigir.
- Atribuir status de funcionalidade com precisão: `implementado no repositório`, `protótipo`, `entregue fora do GitHub`, `planejado`, `não verificado`.

## 5. Divisão de trabalho e Git

- `main`: não assumir que está atualizada.
- `dev`: branch de integração compartilhada, conforme fluxo acordado pela equipe.
- Cada integrante desenvolve em **sua própria branch** criada de `dev`, salvo necessidade previamente combinada.
- Commits pequenos e descritivos; PRs para `dev` após revisão. Não fazer force-push em branch compartilhada.
- Antes de iniciar: `git fetch`, verificar branch-base, executar `git status` e ler os commits recentes. Sincronizar a base conforme estratégia combinada pelo grupo.
- Não resolver conflitos automaticamente se afetarem trabalho de outro integrante. Explicar os conflitos e pedir orientação.
- Atualizar `STATUS_DESENVOLVIMENTO.md` **junto com** commits que adicionem telas, endpoints ou funcionalidades e listar os testes executados.

## 6. Verificação e segurança

- No frontend, executar em `frontend/`: `pnpm build` e, quando possível, `pnpm lint`. Não declarar aprovação de testes não executados.
- O backend atualmente tem script `pnpm dev`; não presumir que há suite de testes ou script de build já configurado.
- Versionar alterações necessárias no `pnpm-lock.yaml` ao instalar dependências.
- **Nunca commitar `.env`, tokens, senhas, URLs com credenciais, chaves privadas ou dados pessoais reais.** Preferir `.env.example` sem valores sensíveis. Verificar `.gitignore` antes de qualquer publicação.
- Não publicar imagens de pessoas, dados reais de usuários ou telemetria privada sem autorização.

## 7. Entrega de cada tarefa para revisão

Ao concluir, informar de forma curta e verificável:

1. O que foi desenvolvido e em quais arquivos.
2. Como utilizar/importar, e se há dependências novas.
3. Se os dados são mocks ou reais e quais funções da API ainda faltam.
4. Quais comandos foram executados (`build`, `lint`, testes) e seus resultados — ou o que não foi possível testar.
5. Pendências, decisões não confirmadas e possíveis conflitos com outros módulos.
6. Se houve alteração **somente local**, commit, PR ou merge (nunca confundir esses estados).

**Regra final:** o que está no Figma, no ERS ou em uma conversa anterior não equivale a uma implementação no GitHub. Confira sempre o código da branch antes de prosseguir.
