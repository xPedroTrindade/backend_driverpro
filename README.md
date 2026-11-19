# DriverPro Backend

API do DriverPro (motoristas particulares e passageiros): cadastro e login, agenda de corridas com orçamento, veículos, folgas, notificações e avatar.

**Stack:** Node.js 22 · Express 5 · TypeScript · PostgreSQL (Supabase) · Prisma 6 · Zod · JWT + bcrypt · Supabase Storage (avatares)

## Rodando localmente

```bash
npm install          # também roda `prisma generate`
cp .env.example .env # preencha DATABASE_URL, DIRECT_URL, JWT_SECRET, SUPABASE_*
npm run db:migrate   # aplica as migrations no banco do .env (usa DIRECT_URL)
npm run dev
```

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Pooler do Supabase (Transaction, porta **6543**, `?pgbouncer=true`). Usada pela API. |
| `DIRECT_URL` | Session pooler (porta **5432**). Usada só pelo `prisma migrate`. |
| `JWT_SECRET` | Assina os tokens de login. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Storage dos avatares (bucket privado `avatars`). Chave secreta, só no servidor. |
| `GOOGLE_MAPS_API_KEY` | Rotas/distância (`/api/maps`). |
| `SMTP_*` | Ainda não usado: o envio de e-mail é um stub. |

## Regras de negócio das corridas

**Status** (fluxo único):

```
pedido do passageiro:  aguardando_orcamento ──(motorista orça)──▶ aguardando_confirmacao ──(passageiro confirma)──▶ confirmada
corrida manual:        já nasce confirmada
                       confirmada ──(motorista inicia)──▶ em_andamento ──(motorista conclui)──▶ concluida
                       qualquer status antes de concluida ──(motorista ou passageiro)──▶ cancelada
```

- **Lucro calculado no servidor:** combustível = distância (×2 se ida e volta) ÷ consumo × preço do litro; custo = combustível + pedágio; lucro = valor − custo. Se o consumo não vier, usa o do veículo. Valores de custo ou lucro enviados pelo app são ignorados.
- **Estatísticas do motorista:** ao concluir, `lucroTotal` e `totalCorridas` são somados **na mesma transação** que muda o status, com update condicional ao status lido. Dois "concluir" simultâneos somam uma vez só.
- **Agenda:** um pedido é recusado (409) se a data cai numa folga do motorista ou se ele já tem corrida ativa no mesmo dia e hora. O horário é garantido por uma `EXCLUDE` no banco, válida mesmo com pedidos simultâneos.
- **Notificações:** o motorista é avisado de pedido, confirmação, início e conclusão. O passageiro é avisado de orçamento, início e conclusão. No cancelamento, só a outra parte é avisada.
- **"Hoje"** (resumo do dia, próxima corrida) é calculado no fuso de Brasília, não no UTC do servidor.

## Banco de dados

- Esquema: `prisma/schema.prisma`. Migrations versionadas em `prisma/migrations/`.
- As migrations também criam o que o Prisma não declara: CHECKs, as `EXCLUDE` que impedem folgas sobrepostas e corridas no mesmo horário (extensão `btree_gist`) e **RLS ligado sem policies** em todas as tabelas, o que fecha a API REST pública do Supabase.
- Nova mudança de esquema: edite o `schema.prisma` e rode `prisma migrate dev --name <nome>`.
- Mais detalhes em [docs/database/](docs/database/).

## Testes

```bash
npm test
```

São 57 testes de contrato, que falam só HTTP com a API, e 1 teste de unidade (fuso horário). Cada arquivo de teste sobe um **Postgres embutido** (`embedded-postgres`, mesma versão do Supabase), aplica as migrations reais e apaga tudo no fim. Não precisa de Docker nem de internet, e nunca toca no banco do Supabase. Na primeira execução o pacote extrai os binários do Postgres.

```bash
npx tsc --noEmit     # checagem de tipos
```

## Deploy (Render)

- **Build command:** `npm install && npm run build && npm run db:migrate`
- **Start command:** `npm start`
- **Env vars:** `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GOOGLE_MAPS_API_KEY`

## Estrutura

```
src/
  app.ts, server.ts        app Express (sem efeitos colaterais) e boot
  lib/prisma.ts            client único do Prisma (omite passwordHash por padrão)
  lib/serialize.ts         converte linhas do Prisma no JSON da API (_id, números, "YYYY-MM-DD", "HH:MM")
  lib/errors.ts            reconhece erros do Prisma/Postgres (P2002, P2023, 23P01...)
  routes/ controllers/     rotas e handlers HTTP
  lib/time.ts              "hoje" no fuso de Brasília
  services/                regras com transação (rideService), cálculo de lucro (rideFinance), auth, notificações, avatar
  middlewares/             auth (JWT), ownership, upload
prisma/                    schema e migrations
tests/                     testes de contrato (node:test)
docs/database/             documentação do modelo de dados
```
