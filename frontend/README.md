# Frontend do Argos

Para usar a API no notebook, copie `.env.example` para `.env.local` na pasta `frontend/`. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com a URL e a chave publicável do mesmo projeto usado pelo Express. Configure `VITE_API_URL` com a URL da API incluindo `/api`. Qualquer variável `VITE_*` fica acessível ao navegador. Guarde as chaves secretas exclusivamente no servidor.

Na raiz, execute `pnpm install`, inicie a API com `pnpm --dir backend dev` e abra outro terminal para `pnpm --dir frontend dev`. Acesse `http://localhost:5173/Argos/` com uma conta existente. As consultas de negócio exigem uma propriedade vinculada à conta. Para testar pelo celular, use o endereço do notebook na rede local em `VITE_API_URL`, habilite acesso de rede ao Vite e inclua a origem do frontend em `CORS_ORIGIN` no backend. Reinicie os processos depois de configurar o ambiente.

| Rota após `/Argos/#` | Uso atual |
|---|---|
| `/auth` | Login com e-mail e senha. Retorna à rota solicitada. |
| `/` | Resumo por zona da propriedade, atualizado a cada 30 segundos enquanto a tela está ativa. |
| `/animals` | Visão por zona (`?zona=<id>`): banner, destaque, animais sem detecção, mapa ilustrativo e histórico. |
| `/receptores` | Status dos receptores com banner e mapa da zona escolhida (`?zona=<id>`). |
| `/alertas` | Central de Alertas: resumo por estado, filtro, paginação e ações de leitura e resolução. |
| `/perfil` | Conta, propriedade editável e resumo dos cadastros. |
| `/configuracoes` | Cadastros de zonas, dispositivos, animais (com pesagens) e vínculos (`?aba=`). |
| `/demonstracao` | Galeria pública com os componentes e dados simulados para desenvolvimento visual. |
| `/demonstracao/inicio`, `/demonstracao/animais`, `/demonstracao/receptores`, `/demonstracao/alertas`, `/demonstracao/configuracoes`, `/demonstracao/perfil`, `/demonstracao/primeiro-acesso` | Prévias públicas de todas as telas, inteiramente simuladas, com cenários preenchido, vazio, erro, carregando e desatualizado. Não consultam a API. |

## Tela inicial — 16/11/2026

A rota `/` (`Monitoramento.tsx`) reproduz o frame “Teste Tela” do Figma. Em 1920 px a grade usa largura útil de 1786 px, quatro colunas com espaço de 27 px e as alturas do design. Abaixo de 1280 px os cards passam para duas colunas e, no celular, para uma; o Animal em Destaque empilha imagem e dados, e os gráficos mantêm a rolagem horizontal. O fundo branco vale apenas para essa tela e sua prévia.

As consultas ficam em `lib/fonteMonitoramento.ts` e usam `consultarApi` com TanStack Query, atualizando a cada 30 segundos. Uma consulta sem atualização concluída há mais de 90 segundos, ou com falha após um resultado anterior, exibe "Dados desatualizados" com o horário da última atualização.

| Bloco | Origem |
|---|---|
| Dados Processados por dia | Leituras de hoje e média diária do intervalo (Dia, Semana, Mês ou calendário), pelo `count` de `/deteccoes`. |
| Animal em Destaque | Primeiro animal recente por identificação: cadastro (`/animais/:id`), última pesagem e última detecção. Liderança, movimento e distância são simulados. |
| Análise Geral (zonas) | `/monitoramento/resumo` para animais e coleiras na zona; `/zonas` com `/monitoramento/receptores` para receptores ativos (um por zona). |
| Quantidade de Cabeças | Resumo reconciliado, incluindo "Sem zona". |
| Status Receptores | Comunicação observada, quatro por página. O RSSI é a última leitura da zona recebida pelo receptor nos últimos 5 minutos. Bateria e modelo do receptor não têm fonte. |
| Temperatura, processamento de imagens, contagem mensal e movimentação | Simulados, com o selo `SeloSimulado`. |

`#/demonstracao/inicio` mostra a mesma tela com fixtures e aceita `?cenario=preenchido|vazio|erro|carregando|desatualizado`; não consulta a API. `node verificar-inicio.mjs` renderiza os cinco cenários por SSR e não substitui o teste no navegador.

## Animais — visão por zona — 16/11/2026

A rota `/animals` (`AnimaisZona.tsx`) reproduz o frame “Visão Geral - Curral 03”. O título abre a lista de zonas e grava a escolha em `?zona=<id>`; os cards de zona do Início levam para cá. O período (Dia, Semana, Mês ou calendário) filtra o histórico.

| Bloco | Origem |
|---|---|
| Banner da zona (`ResumoCurral`) | Animais, receptores e coleiras da zona, animal em destaque e alerta prioritário (avisos novos de animais da zona ou do seu receptor). Intervalo entre dados e Precisão são simulados; o cadastro não tem nome de animal. |
| Análise Geral e Distribuição de Comportamento | Simulados (dependem do modelo de comportamento). |
| Animal em Destaque | Primeiro animal recente da zona, como no Início. |
| Animais Sem Detecção Recente | Adaptação do card "Fora da Área de Cobertura": animais desatualizados cuja última posição foi a zona, maior tempo sem detecção e detectados agora. O gráfico é simulado. Não há geofence. |
| Mapa | Ilustração estática (`MapaIlustrativoZona`) com zoom; sem coordenadas no banco. O marcador mostra a contagem real. |
| Histórico de Leitura | `/deteccoes` da zona no período, todas as páginas até 2.000 linhas; acima disso, aviso e exportação do período completo pelo servidor (`/deteccoes/exportar`). Colunas: ID, área, animal, data, hora, sexo, receptor, RSSI e bateria da coleira. |

`#/demonstracao/animais?cenario=` mostra a tela com fixtures, sem consultar a API.

## Receptores — 16/11/2026

A rota `/receptores` (`ReceptoresZona.tsx`) reproduz o frame “Status Receptores”. O título usa o mesmo seletor de zona de Animais para o banner e o mapa; os cards mostram todos os receptores da propriedade.

| Bloco | Origem |
|---|---|
| Cards grandes (`ReceptorCard`), 4 por página | Comunicação e RSSI atual (última leitura da zona recebida pelo receptor nos últimos 5 min). No período: registros por dia, intervalo médio entre leituras e perdas de sinal (lacunas acima de 5 min), calculados de até 2.000 leituras por receptor, com aviso quando parcial. Modelo e bateria sem fonte. A seta abre a zona em Animais. |
| Cards pequenos (`ReceptorResumoCard`) | Só com mais de 4 receptores: lista todos; o clique leva ao card grande correspondente. Até 4, Análises do Modelo ocupa a largura toda. |
| Análises do Modelo | Simulado (GRU não integrado). |
| Mapa | `MapaIlustrativoZona` com o marcador do receptor da zona. |

As consultas por zona ficam em `hooks/useMonitoramento.ts` e são compartilhadas com Animais.

## Alertas — 16/11/2026

`/alertas` (`pages/Alertas.tsx`) não tem frame no Figma e segue a identidade das demais telas. Os quatro indicadores (`IndicadorAlertas`) mostram novos, novos de prioridade alta ou crítica, lidos e resolvidos. A lista usa `ItemAlerta`, com a prioridade na aba lateral (crítica em vermelho, alta em laranja, média em caramelo, baixa em marrom), e é paginada pelo servidor, dez avisos por vez, filtrada por `SeletorEstadoAlerta`. "Marcar como lido" e "Resolver" usam `enviarApi` (`PATCH /alertas/:id`), bloqueiam o botão durante o envio, exibem um aviso de sucesso ou falha e atualizam o cache, incluindo o alerta prioritário dos banners de zona.

## Configurações (cadastros) — 16/11/2026

`/configuracoes` reúne os cadastros em abas: Zonas, Dispositivos, Animais e Vínculos. Na aba Animais, o painel Pesagens mostra o histórico, o ganho médio diário e registra uma pesagem por dia. As tabelas usam `TabelaCadastro`; criação e edição abrem o painel lateral `PainelFormulario`, com campos em `CampoFormulario`. As regras da API são antecipadas no formulário: zona ativa exige receptor, um receptor atende uma zona por vez, o tipo do dispositivo não muda e só animais e coleiras ativos e livres podem ser vinculados. As mensagens de conflito do servidor aparecem no painel e em um aviso. Depois de salvar, o cache dos cadastros e das telas de monitoramento é atualizado.

## Primeiro acesso e Perfil — 16/11/2026

Toda a área autenticada passa por `GuardaPropriedade`. Se a conta não tem propriedade, aparece `PrimeiroAcesso`; depois do cadastro, o app abre Configurações › Dispositivos. O Perfil mostra a conta, permite editar a propriedade e resume os cadastros, com atalhos para Configurações. Erros da API chegam como `ErroApi`, com `status` e `codigo`.

O `CardHeader` de `ui/card.tsx` não é container: classes `@min-*` dentro do cabeçalho consultam o card. Novos cards devem declarar `@container` no próprio `Card`.

Para desenvolver novas telas, use `consultarApi` com um caminho relativo à API e o `signal` do TanStack Query. A função envia o token da sessão. O cache de consultas pertence ao usuário conectado. O botão Sair encerra a sessão local. A tela de login possui layout responsivo e animação de entrada; cadastro de usuários e recuperação de senha não fazem parte do fluxo disponível e seguem sob responsabilidade da equipe.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
