# Controle de Acesso — Autenticação e Autorização

## Visão Geral

O backend utiliza **Firebase Authentication** para geração de tokens JWT e **MongoDB** para persistência dos dados. Cada requisição a uma rota protegida deve conter o token do Firebase no header `Authorization`.

---

## Fluxo de Autenticação

```
Cliente (app)
    │
    ├─ Firebase Auth → obtém ID Token (JWT)
    │
    └─ Requisição HTTP
         ├─ Header: Authorization: Bearer <idToken>
         └─ Backend Express
              ├─ authMiddleware → verifica token via firebase-admin
              │        └─ busca User no MongoDB por firebaseUid
              │        └─ injeta req.user
              └─ ownershipMiddleware → confere driverId === req.user._id
```

---

## Variáveis de Ambiente Necessárias

```env
FIREBASE_PROJECT_ID=driverpro-373d4
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

As credenciais são geradas em:
**Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada**

---

## Middlewares

### `authMiddleware` — `src/middlewares/auth.ts`

| Etapa | Ação |
|---|---|
| 1 | Lê o header `Authorization: Bearer <token>` |
| 2 | Verifica o token via `admin.auth().verifyIdToken()` |
| 3 | Busca o `User` no MongoDB pelo campo `firebaseUid` |
| 4 | Injeta o documento do usuário em `req.user` |

**Respostas de erro:**

| Código | Situação |
|---|---|
| 401 | Header ausente ou sem prefixo `Bearer` |
| 401 | Token inválido, expirado ou revogado |
| 401 | `firebaseUid` não encontrado no MongoDB (usuário não cadastrado) |

---

### `ownershipMiddleware` — `src/middlewares/ownership.ts`

| Etapa | Ação |
|---|---|
| 1 | Lê `driverId` de `req.params` ou `req.body` |
| 2 | Busca o `Driver` pelo `driverId` |
| 3 | Compara `driver.userId` com `req.user._id` |
| 4 | Rejeita se forem diferentes |

**Respostas de erro:**

| Código | Situação |
|---|---|
| 404 | `driverId` não encontrado no banco |
| 403 | `driverId` pertence a outro usuário |
| 400 | `driverId` com formato inválido (ObjectId malformado) |

> **Importante:** `ownershipMiddleware` sempre deve ser usado **após** `authMiddleware`, pois depende de `req.user`.

---

## Rotas Protegidas

| Método | Rota | authMiddleware | ownershipMiddleware |
|---|---|---|---|
| GET | `/api/drivers/:driverId` | ✅ | ✅ |
| PUT | `/api/drivers/:driverId` | ✅ | ✅ |
| POST | `/api/rides` | ✅ | ✅ (driverId no body) |
| GET | `/api/rides/driver/:driverId` | ✅ | ✅ |
| PUT | `/api/rides/:rideId/status` | ✅ | — |
| POST | `/api/vehicles` | ✅ | ✅ (driverId no body) |
| GET | `/api/vehicles/driver/:driverId` | ✅ | ✅ |
| PUT | `/api/vehicles/:vehicleId` | ✅ | — |
| DELETE | `/api/vehicles/:vehicleId` | ✅ | — |
| GET | `/api/unavailable-periods/driver/:driverId` | ✅ | ✅ |
| POST | `/api/unavailable-periods` | ✅ | ✅ (driverId no body) |
| DELETE | `/api/unavailable-periods/:periodId` | ✅ | — |
| GET | `/api/notifications` | ✅ | — |
| PUT | `/api/notifications/:notifId/read` | ✅ | — |
| PUT | `/api/notifications/read-all` | ✅ | — |

---

## Modelo `User` — Campo `firebaseUid`

O campo `firebaseUid` é adicionado ao schema do `User` para mapear o UID do Firebase ao documento MongoDB.

```typescript
firebaseUid: {
  type: String,
  required: true,
  unique: true,
  index: true
}
```

Esse campo é preenchido no momento do cadastro, quando o frontend faz `createUserWithEmailAndPassword` no Firebase Auth e envia o `uid` retornado para o backend criar o `User` no MongoDB.
