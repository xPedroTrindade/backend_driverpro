# Desnormalização: Modelo Relacional → MongoDB

## Introdução

O projeto DriverPro foi modelado inicialmente no paradigma relacional (3FN) e depois desnormalizado para o MongoDB, banco de dados orientado a documentos. Este documento apresenta as decisões de modelagem e os ganhos obtidos com a desnormalização.

---

## Modelo Relacional Original (3FN)

```
users
  id          UUID PK
  nome        VARCHAR(100) NOT NULL
  email       VARCHAR(255) UNIQUE NOT NULL
  password_hash VARCHAR(255)
  telefone    VARCHAR(15)
  tipo        ENUM('motorista','passageiro')
  avatar_url  VARCHAR(500)
  created_at  TIMESTAMP DEFAULT NOW()
  updated_at  TIMESTAMP DEFAULT NOW()

drivers
  id              UUID PK
  user_id         UUID FK → users.id
  preco_km        DECIMAL(5,2)
  conta_verificada BOOLEAN DEFAULT FALSE
  disponivel      BOOLEAN DEFAULT TRUE
  total_corridas  INTEGER DEFAULT 0
  lucro_total     DECIMAL(10,2) DEFAULT 0

passengers
  id      UUID PK
  user_id UUID FK → users.id

vehicles
  id             UUID PK
  driver_id      UUID FK → drivers.id
  modelo         VARCHAR(100)
  placa          VARCHAR(10) UNIQUE
  consumo_medio  DECIMAL(4,1)

rides
  id              UUID PK
  driver_id       UUID FK → drivers.id
  passageiro_nome VARCHAR(100)
  origem          VARCHAR(255)
  destino         VARCHAR(255)
  distancia_km    DECIMAL(6,2)
  valor           DECIMAL(8,2)
  status          ENUM('pendente','em_andamento','concluida','cancelada')
  data            DATE
  hora            TIME
  created_at      TIMESTAMP
  updated_at      TIMESTAMP

unavailable_periods
  id          UUID PK
  driver_id   UUID FK → drivers.id
  data_inicio DATE
  data_fim    DATE
  motivo      ENUM('manutencao','descanso','compromisso_pessoal','outros')

notifications
  id        UUID PK
  user_id   UUID FK → users.id
  ride_id   UUID FK → rides.id NULL
  tipo      ENUM('nova_corrida','corrida_aceita','corrida_cancelada','corrida_concluida')
  titulo    VARCHAR(100)
  corpo     VARCHAR(500)
  lida      BOOLEAN DEFAULT FALSE
  created_at TIMESTAMP
```

**Diagrama de relacionamentos:**
```
users ──< drivers ──< rides
     │           ──< vehicles
     │           ──< unavailable_periods
     └──< passengers
     └──< notifications
```

---

## Modelo Desnormalizado — MongoDB

No MongoDB, os dados foram reorganizados em **coleções independentes com referências por ObjectId**, com desnormalização pontual onde a leitura é mais frequente do que a escrita.

### Decisões de modelagem

#### 1. `users` → separado de `drivers`/`passengers` (referência, não embedding)

**Motivo:** O perfil do usuário é acessado em contextos diferentes do perfil de motorista. Juntar tudo em um documento tornaria o objeto muito grande e dificultaria atualizações parciais.

```js
// Relacional (JOIN obrigatório):
SELECT u.*, d.preco_km FROM users u JOIN drivers d ON d.user_id = u.id

// MongoDB (duas queries ou $lookup):
const user   = await User.findOne({ firebaseUid });
const driver = await Driver.findOne({ userId: user._id });
```

#### 2. `rides` — referência ao `Driver` por ObjectId

**Motivo:** Corridas são entidades independentes com ciclo de vida próprio (criadas, atualizadas, concluídas). Embedding dentro do driver geraria documentos gigantes e dificultaria paginação e filtros por status.

```js
// Documento ride no MongoDB:
{
  _id: ObjectId("..."),
  driverId: ObjectId("..."),  // referência ao Driver
  passageiroNome: "João",
  origem: "Rua A, 100",
  destino: "Rua B, 200",
  distanciaKm: 12.5,
  valor: 31.25,
  status: "concluida",
  data: "2025-05-11",
  hora: "14:30",
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

#### 3. `notifications` — referência ao `User` e ao `Ride`

**Motivo:** Notificações precisam ser listadas por usuário e vinculadas opcionalmente a uma corrida. A referência dupla permite busca eficiente sem duplicar dados.

#### 4. `lucroTotal` e `totalCorridas` no `Driver` — desnormalização intencional

**Motivo:** Essas métricas são exibidas no dashboard do motorista a cada acesso. Calcular `SUM(valor) WHERE status='concluida'` a cada requisição seria custoso. A solução é manter os agregados no documento `Driver` e atualizá-los via hook Mongoose quando uma corrida é concluída.

```js
// Relacional: agregação na query
SELECT SUM(valor) FROM rides WHERE driver_id = ? AND status = 'concluida'

// MongoDB: leitura direta (O(1))
const driver = await Driver.findById(driverId);
// driver.lucroTotal já está atualizado
```

---

## Comparativo: Relacional vs MongoDB

| Aspecto | Modelo Relacional | MongoDB (DriverPro) |
|---|---|---|
| Estrutura | Tabelas normalizadas (3FN) | Coleções com referências |
| Joins | Obrigatórios via FK | Opcional via `$lookup` ou múltiplas queries |
| Integridade referencial | Garantida pelo SGBD | Responsabilidade da aplicação (Mongoose) |
| Transações | `BEGIN TRANSACTION / COMMIT` | `session.startTransaction() / commitTransaction()` |
| Triggers | `CREATE TRIGGER` no banco | Hooks Mongoose (`pre`, `post`) na aplicação |
| Procedures | `CREATE PROCEDURE` | Services/Repositories em TypeScript |
| Agregados (lucro, contagem) | `SUM`, `COUNT` em query | Campos desnormalizados atualizados por hooks |
| Schema | Rígido (DDL) | Flexível (Mongoose valida no app) |
| Escalabilidade | Vertical (mais CPU/RAM) | Horizontal (sharding, replica sets) |

---

## Ganhos com a desnormalização

1. **Dashboard O(1):** `lucroTotal` e `totalCorridas` são leituras simples, sem agregação
2. **Queries de agenda:** buscar corridas de um motorista por data é um filtro direto na coleção `rides`
3. **Flexibilidade de schema:** adicionar campos ao perfil do motorista não exige `ALTER TABLE`
4. **Deploy simplificado:** MongoDB Atlas gerencia réplicas e backups sem configuração de servidor

## Custo da desnormalização

1. **Consistência eventual:** `lucroTotal` depende do hook ser executado; se falhar silenciosamente, o dado diverge
2. **Sem FK nativa:** um `driverId` inválido em `rides` não é rejeitado pelo banco — a validação é responsabilidade do Mongoose/serviço
3. **Transações mais verbosas:** requerem `session` explícita, diferente do SQL onde `BEGIN` é simples
