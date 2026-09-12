# Meu Financeiro

Sistema web de controle financeiro pessoal, multiusuário e com persistência em PostgreSQL. Cada pessoa cria sua conta, faz login e acessa somente os próprios dados.

## Funcionalidades

### Conta e segurança

- Cadastro e login com e-mail e senha.
- Autenticação por JWT.
- Senhas protegidas com `bcryptjs`.
- Dados isolados por usuário no banco de dados.
- Alteração de senha autenticada.
- Sessão persistida no navegador.

### Controle financeiro

- Dashboard com saldo, receitas, despesas, valores pendentes e reservas.
- Cadastro, edição e exclusão de lançamentos.
- Receitas e despesas com descrição, categoria, conta, data, status e forma de pagamento.
- Contas fixas com vencimento, recorrência e marcação de pagamento.
- Transferências entre contas sem distorcer os totais de receita e despesa.
- Calendário financeiro.
- Relatórios resumidos de receitas, despesas e categorias.

### Planejamento

- Cadastro do salário líquido mensal.
- Controle de vale-alimentação separado do saldo em dinheiro.
- Percentual planejado para economia.
- Orçamento por categoria.
- Categorias padrão e categorias personalizadas.
- Edição, exclusão e ocultação de categorias no perfil do usuário.
- Lançamentos recorrentes com geração mensal sem duplicidade.

### Metas

- Criação de metas individuais.
- Valor alvo, valor já reservado, valor mensal, prazo e prioridade.
- Reserva automática de valores.
- Descrição da reserva.
- Lançamento vinculado à meta para manter o histórico.
- Progresso visual da meta.

### Cartões

- Cadastro de cartões.
- Limite, fechamento e vencimento.
- Compras parceladas.
- Faturas por mês.
- Marcação de fatura como paga.
- Histórico de faturas.
- Alertas de contas e faturas em aberto.

### Experiência de uso

- Interface responsiva para desktop, tablet e celular.
- Navegação lateral e inferior no mobile.
- Ícones Lucide.
- Modais para formulários e ações.
- Skeletons específicos para cada página durante a navegação.
- Tela de carregamento durante autenticação e carregamento dos dados.
- Notificações flutuantes de sucesso, erro e informação.
- Formatação monetária brasileira, como `1.729,64`.
- Backup e restauração dos dados em JSON.

## Tecnologias

- React 19
- TypeScript
- Vite
- Express
- PostgreSQL
- `pg`
- JWT
- `bcryptjs`
- Lucide React
- ESLint

## Como funciona

O frontend React conversa com a API Express por meio de endpoints autenticados. Após o login, o token JWT identifica o usuário. A API usa o identificador presente no token para buscar e salvar os dados somente na linha correspondente da tabela `finance_data`.

Os dados financeiros são armazenados como um documento JSON associado ao usuário. Isso permite evoluir o modelo do frontend mantendo compatibilidade por meio da função `normalizeData()`.

Despesas pagas com **Vale alimentação**:

- aparecem normalmente nos lançamentos e relatórios;
- reduzem o saldo disponível do vale;
- não reduzem o saldo das contas em dinheiro;
- não reduzem o saldo bancário consolidado.

## Pré-requisitos

- Node.js 18 ou superior.
- npm.
- PostgreSQL, localmente ou em um provedor como Neon.

## Configuração local

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure as variáveis de ambiente

Copie o arquivo de exemplo:

```bash
copy .env.example .env
```

No Linux ou macOS:

```bash
cp .env.example .env
```

Preencha o `.env`:

```env
DATABASE_URL=postgresql://usuario:senha@host:5432/banco?sslmode=require
JWT_SECRET=uma-chave-longa-e-aleatoria
WEB_ORIGIN=http://localhost:5173
PORT=3001
```

Nunca envie `.env`, senha do banco ou `JWT_SECRET` para o GitHub.

### 3. Crie as tabelas

```bash
npm run db:migrate
```

A migração cria:

- `users`: usuários cadastrados;
- `finance_data`: dados financeiros associados a cada usuário.

### 4. Execute o projeto

Para iniciar API e frontend juntos:

```bash
npm run dev
```

Ou execute separadamente:

```bash
npm run api
npm run frontend
```

URLs padrão:

- Frontend: http://localhost:5173
- API: http://localhost:3001
- Health check: http://localhost:3001/api/health

## Deploy no Vercel

O projeto já possui uma função serverless em `api/[...path].ts`. Ela encaminha as rotas `/api/*` para a API Express, enquanto o frontend continua usando os caminhos relativos `/api/...`.

No projeto da Vercel, configure estas variáveis em **Settings > Environment Variables** para os ambientes usados no deploy:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=uma-chave-longa-e-aleatoria
WEB_ORIGIN=https://seu-projeto.vercel.app
```

Depois de salvar as variáveis, faça um novo deploy. O endpoint abaixo deve responder JSON:

```text
https://seu-projeto.vercel.app/api/health
```

Se o endpoint retornar uma página HTML ou `The page could not be found`, a função da API não foi publicada ou o deploy ainda está usando uma versão anterior do projeto.

## Scripts disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia API e frontend juntos |
| `npm run frontend` | Inicia o Vite |
| `npm run api` | Inicia a API Express |
| `npm run db:migrate` | Executa as migrações PostgreSQL |
| `npm run build` | Executa type-check e build de produção |
| `npm run lint` | Executa o ESLint |

No Windows, se o PowerShell bloquear `npm.ps1`, use `npm.cmd`, por exemplo:

```powershell
npm.cmd run build
npm.cmd run lint
```

## Estrutura do projeto

```text
.
├── server/
│   ├── db.ts
│   ├── index.ts
│   └── migrate.ts
├── sql/
│   └── 001_initial.sql
├── src/
│   ├── components/
│   ├── domain/
│   ├── services/
│   ├── App.tsx
│   └── index.css
├── .env.example
├── dev.mjs
├── package.json
└── vite.config.ts
```

### Responsabilidade dos diretórios

- `src/domain`: tipos, normalização, categorias e regras financeiras.
- `src/components`: componentes reutilizáveis de planejamento e orçamento.
- `src/services`: comunicação do frontend com a API.
- `src/App.tsx`: composição da aplicação, autenticação, navegação, modais e operações.
- `server`: API, autenticação, autorização e persistência.
- `sql`: estrutura inicial do banco.

## Persistência e isolamento

Todas as operações financeiras usam o token do usuário autenticado. A API nunca recebe um `user_id` enviado pelo frontend para decidir o proprietário dos dados; ela extrai o usuário do JWT e usa esse identificador nas consultas.

O salvamento utiliza `INSERT ... ON CONFLICT DO UPDATE`, garantindo que o primeiro salvamento de um usuário também seja persistido corretamente.

## Validação

Antes de enviar alterações:

```bash
npm run lint
npm run build
```

## Segurança

- Mantenha o `.env` fora do controle de versão.
- Use um `JWT_SECRET` diferente em cada ambiente.
- Use uma conexão PostgreSQL com SSL em produção.
- Configure `WEB_ORIGIN` somente para os domínios autorizados.
- Não compartilhe tokens, senhas ou URLs privadas do banco.

## Próximos passos sugeridos

- Filtros avançados por período, conta e categoria.
- Exportação CSV, Excel e PDF.
- Recuperação de senha por e-mail.
- Tema escuro.
- Importação de extratos bancários.
- PWA e notificações do navegador.
