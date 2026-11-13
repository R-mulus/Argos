# Frontend do Argos

Para usar a API no notebook, copie `.env.example` para `.env.local` na pasta `frontend/`. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com a URL e a chave publicável do mesmo projeto usado pelo Express. Configure `VITE_API_URL` com a URL da API incluindo `/api`. Qualquer variável `VITE_*` fica acessível ao navegador. Guarde as chaves secretas exclusivamente no servidor.

Na raiz, execute `pnpm install`, inicie a API com `pnpm --dir backend dev` e abra outro terminal para `pnpm --dir frontend dev`. Acesse `http://localhost:5173/Argos/` com uma conta existente. As consultas de negócio exigem uma propriedade vinculada à conta. Para testar pelo celular, use o endereço do notebook na rede local em `VITE_API_URL`, habilite acesso de rede ao Vite e inclua a origem do frontend em `CORS_ORIGIN` no backend. Reinicie os processos depois de configurar o ambiente.

| Rota após `/Argos/#` | Uso atual |
|---|---|
| `/auth` | Login com e-mail e senha. Retorna à rota solicitada. |
| `/` | Resumo por zona da propriedade, atualizado a cada 30 segundos enquanto a tela está ativa. |
| `/animals`, `/receptores`, `/alertas` | Listas paginadas da API. |
| `/perfil` | E-mail da conta atual. |
| `/configuracoes` | Espaço reservado à tela de configurações. |
| `/demonstracao` | Galeria pública com os componentes e dados simulados para desenvolvimento visual. |

Para desenvolver novas telas, use `consultarApi` com um caminho relativo à API e o `signal` do TanStack Query. A função envia o token da sessão. O cache de consultas pertence ao usuário conectado. O botão Sair encerra a sessão local. O layout definitivo, o cadastro de usuários e a recuperação de senha seguem disponíveis para desenvolvimento pela equipe.

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
