# Argos
Repositório direcionado para o desenvolvimento da aplicação Argos, para o Projeto Integrador V do curso de Sistemas de Informação, UNIPAM.

# 1. Stack do Projeto:

### Backend
- Escrito com o framework Express + Typescript
- Arquitetura MVC
- Utilização da API do Supabase
    - *A API do Supabase tem o intuito de ser usada diretamente no frontend, sem precisar criar uma API própria. Entretanto, isso pode criar desvantagens no futuro por problemas de acomplamento*

#### Bibliotecas do Backend (*13/10/2026*):
- **@supabase/supabase-js**: biblioteca JS do Supabase
- **cors**: biblioteca que *supostamente* evita o erro de CORS
- **dotenv**: biblioteca que facilita o uso e manipulação de arquivos .env
- **express**: framework para criação e gerenciamento do servidor e rotas HTTP
- **@types/cors**: tipos do TypeScript para a biblioteca cors
- **@types/express**: tipos do TypeScript para o framework Express
- **nodemon**: ferramenta que reinicia o servidor automaticamente ao alterar arquivos
- **tsx**: executor de TypeScript rápido para rodar arquivos .ts sem precisar compilar na mão
- **typescript**: suporte e compilador da linguagem TypeScript no Node.js

---

### Frontend:

- Estrutura feita com React Typescript + Vite
- Componentes e temas gerados no shadcn/ui
- Estilização com tailwind.css
- A gestão de Auth é feita por meio da API do Supabase e fica localizada diretamente no frontend para facilitar o uso

#### Bibliotecas do Frontend (*13/10/2026*):
- **@supabase/supabase-js**: biblioteca JS do Supabase para manipular Auth e dados no frontend
- **@tailwindcss/vite**: plugin para integrar o Tailwind CSS direto no Vite
- **@tanstack/react-form**: biblioteca para gerenciamento e validação de formulários
- **@tanstack/react-query**: biblioteca para requisições, cache e gerenciamento de estado assíncrono
- **@tanstack/react-table**: biblioteca para gerenciamento de tabelas
- **axios**: cliente HTTP para fazer requisições à API
- **cn**: função utilitária para juntar e alternar classes do Tailwind sem conflito
- **lucide-react**: biblioteca de ícones em SVG para React
- **react**: biblioteca principal para criação da interface baseada em componentes
- **react-dom**: pacote que renderiza os componentes do React no navegador (DOM)
- **react-router-dom**: biblioteca para gerenciamento de rotas e navegação de páginas
- **shadcn**: CLI para instalar e gerenciar componentes do shadcn/ui
- **tailwindcss**: framework utilitário para estilização CSS
- **tw-animate-css**: plugin para adicionar animações do Animate.css no Tailwind
- **zustand**: biblioteca simples e leve para gerenciamento de estado global

# 2. Como Desenvolver:

O projeto Argos é um monorepo com 3 pastas principais:

- **Frontend**
- **Backend**
- **Shared**
    - *Na pasta "Shared" está incluso tudo que é compartilhado entre as pastas "Backend" e "Frontend", como os tipos typescript das tabelas do banco*

### Como Iniciar os Servidores:

1. Aperte ```CTRL``` + ```SHIFT``` + ```P``` para abrir a paleta de comandos do VSCode
2. Pesquise por "Executar Tarefa" ou "Run Task" (vai depender da linguagem que o seu VSCode está) e execute
3. Selecione e execute a tarefa "Iniciar Servidores". Isso irá abrir dois terminais com ambos os servidores de backend e frontend rodando

---

### Desenvolvendo no Frontend

Antes de criar um componente customizado, cheque primeiro no [shadcn](https://ui.shadcn.com/docs/components) para ver se o componente que você precisa já existe. **Certifique-se que os componentes que você baixar estejam na variação "Base UI", e <span style="color:red">NÃO</span> em "Radix UI" ou "Radix UI"**.

Sempre instale componentes via o comando que a própria documentação do shadcn te fornece (mais prático e evita erros). Exemplo:

```
pnpm dlx shadcn@latest add accordion
```

Caso quando for instalar um componente o terminal perguntar se pode  <span style="color:green">**INSTALAR**</span> outros componentes necessários, pode <span style="color:green">**confirmar apertando Y**</span>.

Caso quando for instalar um componente o terminal perguntar se pode  <span style="color:red">**SOBRESCREVER**</span> componentes existentes, <span style="color:red">**negue apertando N**</span>.

> Isso é importante pois caso nós mesmos tenhamos feito alguma alteração num componente existente do shadcn, não queremos que ela seja sobrescrita

---

### Desenvolvendo no Backend

XD

## Instalando Bibliotecas e Dependências

Para instalar dependências do frontend, certifique-se de estar dentro da pasta de onde será instalada a dependência/biblioteca nova. Exemplo:

### Instalando um Componente shadcn
1. Abra a pasta frontend do projeto (como ```Argos/frontend```)
2. Rode o comando de instalação (ex: ```pnpm dlx shadcn@latest add card```)
3. Pronto

### Instalando uma Biblioteca Backend
1. Abra a pasta backend do projeto (como ```Argos/backend```)
2. Rode o comando de instalação (ex: ```pnpm i <biblioteca>```)
3. Pronto