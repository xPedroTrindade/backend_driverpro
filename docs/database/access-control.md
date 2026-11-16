# Controle de Acesso — Autenticação e Autorização

## Visão Geral

O backend tem **autenticação própria**: senha com **bcrypt** e sessão com **JWT** assinado pelo próprio servidor (`JWT_SECRET`). Os dados ficam no **Postgres do Supabase**, acessado pelo Prisma. Não usamos Firebase nem Supabase Auth.

Cada requisição a uma rota protegida deve conter o token no header `Authorization`.

---

## Fluxo de Autenticação

```
Cliente (app)
    │
    ├─ POST /auth/register ou /auth/login  →  recebe { token, user, driverId? }
    │
    └─ Requisição HTTP
         ├─ Header: Authorization: Bearer <token>
         └─ Backend Express
              ├─ authMiddleware → jwt.verify(token, JWT_SECRET)
              │        └─ busca o User no Postgres pelo id do token
              │        └─ injeta req.user (sem passwordHash)
              └─ ownershipMiddleware → confere driver.userId === req.user.id
```

---

## Variáveis de Ambiente Necessárias

```env
JWT_SECRET=<64 bytes aleatórios em hex>
DATABASE_URL=<pooler do Supabase, porta 6543, ?pgbouncer=true>
```

Gerar o segredo: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## Senhas

- Gravadas só como hash bcrypt (`SALT_ROUNDS = 10`) em `users.password_hash`, via `hashPassword()` em `src/services/authService.ts`.
- O client do Prisma (`src/lib/prisma.ts`) **omite `passwordHash` em todas as consultas** por padrão. Só o login pede o campo explicitamente (`omit: { passwordHash: false }`). Assim nenhuma rota devolve o hash por engano.
- Login com e-mail inexistente e com senha errada devolve **a mesma mensagem** (401), para não revelar quais e-mails estão cadastrados.
- O e-mail é normalizado (trim + minúsculas) no validator antes de gravar e antes de buscar.

---

## Middlewares

### `authMiddleware` — `src/middlewares/auth.ts`

| Etapa | Ação |
|---|---|
| 1 | Lê o header `Authorization: Bearer <token>` |
| 2 | Verifica assinatura e validade com `jwt.verify()` (expira em 7 dias) |
| 3 | Busca o `User` no Postgres pelo `id` do token |
| 4 | Injeta o usuário em `req.user` |

**Respostas de erro:**

| Código | Situação |
|---|---|
| 401 | Header ausente ou sem prefixo `Bearer` |
| 401 | Token inválido ou expirado (inclui tokens antigos da época do MongoDB) |
| 401 | Usuário do token não existe mais |

---

### `ownershipMiddleware` — `src/middlewares/ownership.ts`

| Etapa | Ação |
|---|---|
| 1 | Lê `driverId` de `req.params` ou `req.body` |
| 2 | Busca o `Driver` pelo `driverId` |
| 3 | Compara `driver.userId` com `req.user.id` |
| 4 | Rejeita se forem diferentes |

**Respostas de erro:**

| Código | Situação |
|---|---|
| 404 | `driverId` não encontrado no banco |
| 403 | `driverId` pertence a outro usuário |
| 400 | `driverId` com formato inválido (não é UUID) |

> **Importante:** `ownershipMiddleware` sempre deve ser usado **após** `authMiddleware`, pois depende de `req.user`.

Rotas que recebem o id de outro recurso (corrida, veículo, folga) checam o dono **dentro do controller**, carregando o recurso junto com o `userId` do motorista.

Em corridas, o papel do usuário vem da relação com a corrida: dono do `driverId` = motorista; `passageiroId` = passageiro. A tabela `TRANSICOES` (`src/controllers/rideController.ts`) define quem pode levar a corrida de um status a outro.

---

## Rotas Protegidas

| Método | Rota | authMiddleware | Dono checado em |
|---|---|---|---|
| GET | `/api/drivers` | ✅ | — (visão pública, sem e-mail nem lucro) |
| GET | `/api/drivers/:driverId` | ✅ | ownershipMiddleware |
| PUT | `/api/drivers/:driverId/pricing` | ✅ | ownershipMiddleware |
| PUT | `/api/drivers/:driverId/availability` | ✅ | ownershipMiddleware |
| GET | `/api/drivers/:driverId/summary` · `next-ride` · `pending-count` · `schedule` | ✅ | ownershipMiddleware |
| GET/POST | `/api/drivers/:driverId/passengers` | ✅ | ownershipMiddleware |
| POST | `/api/rides` | ✅ | controller (driverId do body) |
| POST | `/api/rides/request` | ✅ | — (qualquer usuário logado pede corrida) |
| GET | `/api/rides/driver/:driverId` | ✅ | ownershipMiddleware |
| GET | `/api/rides/passenger/:userId` | ✅ | controller (só o próprio) |
| PUT | `/api/rides/:rideId/quote` | ✅ | controller (motorista da corrida) |
| PUT | `/api/rides/:rideId/confirm` | ✅ | controller (passageiro da corrida) |
| PUT | `/api/rides/:rideId/status` | ✅ | controller (papel na corrida + `TRANSICOES`) |
| POST | `/api/vehicles` | ✅ | controller (driverId do body) |
| GET | `/api/vehicles/driver/:driverId` | ✅ | — |
| PUT/DELETE | `/api/vehicles/:vehicleId` | ✅ | controller |
| GET | `/api/unavailable-periods/driver/:driverId` | ✅ | — (qualquer usuário logado) |
| POST | `/api/unavailable-periods` | ✅ | controller (driverId do body) |
| DELETE | `/api/unavailable-periods/:periodId` | ✅ | controller |
| GET/PUT | `/api/notifications/...` | ✅ | consulta filtrada por `userId` |
| GET/PUT | `/api/users/:id` | ✅ | controller (outros veem só nome, tipo e avatar) |
| POST | `/api/users/:id/avatar` | ✅ | controller (só o próprio) |
| GET | `/api/users/:id/avatar` | — | pública (imagem) |

---

## Banco: RLS no Supabase

O Supabase publica as tabelas do schema `public` numa API REST (PostgREST) que aceita a chave **anon**, que é pública. Como o app não usa essa API, **todas as tabelas têm RLS ligado e nenhuma policy**. Com isso, `anon` e `authenticated` não leem nem escrevem nada. A tabela `_prisma_migrations` também entra nessa regra.

O backend conecta como role de servidor (`postgres`), que ignora RLS. Toda autorização acontece nos middlewares e controllers descritos acima.

Os avatares ficam num bucket **privado** do Supabase Storage (`avatars`). O backend acessa o bucket com a chave secreta (`SUPABASE_SECRET_KEY`), que nunca vai para o app.
