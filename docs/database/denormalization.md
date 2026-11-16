# Modelo de Dados: Relacional (Postgres) com Desnormalização Pontual

## Introdução

O DriverPro foi modelado no paradigma relacional (3FN). A primeira versão usou o MongoDB, com coleções e referências por ObjectId. Na versão atual o projeto voltou ao relacional, com **PostgreSQL no Supabase** e **Prisma** como ORM. Este documento descreve o modelo, a única desnormalização mantida (as estatísticas do motorista) e o que mudou em relação à versão MongoDB.

O esquema é definido em `prisma/schema.prisma`. O que o Prisma não consegue declarar (CHECK, EXCLUDE, RLS) está no fim de `prisma/migrations/20261116000000_init/migration.sql`.

---

## Modelo Relacional (3FN)

```
users
  id             UUID PK
  nome           TEXT NOT NULL
  email          TEXT UNIQUE NOT NULL          -- sempre em minúsculas
  password_hash  TEXT NOT NULL                 -- bcrypt
  telefone       TEXT NOT NULL
  tipo           "UserTipo" ('motorista','passageiro')
  avatar_url     TEXT DEFAULT ''
  created_at / updated_at  TIMESTAMP

drivers
  id                UUID PK
  user_id           UUID UNIQUE FK → users.id      ON DELETE CASCADE
  preco_km          DECIMAL(8,2)  CHECK 0..50
  conta_verificada  BOOLEAN DEFAULT false
  disponivel        BOOLEAN DEFAULT true
  total_corridas    INTEGER DEFAULT 0  CHECK >= 0  -- desnormalizado
  lucro_total       DECIMAL(12,2) DEFAULT 0        -- desnormalizado

passengers
  id                    UUID PK
  user_id               UUID UNIQUE FK → users.id    ON DELETE CASCADE
  created_by_driver_id  UUID FK → drivers.id NULL    ON DELETE SET NULL

vehicles
  id             UUID PK
  driver_id      UUID UNIQUE FK → drivers.id         -- um veículo por motorista
  modelo         TEXT
  placa          TEXT UNIQUE
  consumo_medio  DECIMAL(6,2) NULL  CHECK > 0
  lugares        INTEGER NULL       CHECK 1..100
  aceita_pets / aceita_cadeirinha / aceita_volumes  BOOLEAN

rides
  id                 UUID PK
  driver_id          UUID FK → drivers.id
  passageiro_id      UUID FK → users.id NULL         -- null em corrida manual
  passageiro_nome    TEXT
  origem / destino   TEXT
  distancia_km       DECIMAL(8,2)  CHECK > 0
  valor, taxa_espera, pedagio, custo_combustivel, custo_total  DECIMAL(10,2) CHECK >= 0
  lucro_liquido      DECIMAL(10,2) NULL
  status             "RideStatus"
  data               DATE
  hora               TIME(0)

unavailable_periods
  id           UUID PK
  driver_id    UUID FK → drivers.id
  data_inicio  DATE
  data_fim     DATE          CHECK data_fim >= data_inicio
  motivo       "PeriodoMotivo"
  EXCLUDE: dois períodos do mesmo motorista não se sobrepõem

notifications
  id         UUID PK
  user_id    UUID FK → users.id
  ride_id    UUID FK → rides.id
  tipo       "NotificationTipo"
  titulo, corpo  TEXT
  lida       BOOLEAN DEFAULT false
  criado_em  TIMESTAMP
```

**Diagrama de relacionamentos:**
```
users ──1:1── drivers ──< rides >── users (passageiro)
     │                ──1:1 vehicles
     │                ──< unavailable_periods
     │                ──< passengers (cadastrados por ele)
     ├──1:1── passengers
     └──< notifications >── rides
```

---

## Decisões de modelagem

#### 1. `users` separado de `drivers`/`passengers`

O login e o perfil básico são iguais para os dois papéis. O que é específico de cada um (preço por km, disponibilidade, quem cadastrou o passageiro) fica na tabela do papel, numa relação 1:1 (`user_id UNIQUE`). O cadastro cria o usuário e o perfil **numa única escrita atômica** (*nested create* do Prisma).

#### 2. Dinheiro em `DECIMAL`, não em ponto flutuante

`valor`, `preco_km`, `lucro_total` etc. são `DECIMAL`. Isso evita erros de arredondamento como `0.1 + 0.2 = 0.30000000000000004` ao somar o lucro de muitas corridas. A API continua devolvendo número no JSON: o serializer converte `Decimal` em `number`.

#### 3. `data` e `hora` com tipos reais

No MongoDB eram strings `"YYYY-MM-DD"` e `"HH:MM"`. Agora são `DATE` e `TIME`, o que permite filtros de intervalo (`data >= hoje`, mês do calendário) e ordenação corretos no banco. A API continua expondo as mesmas strings (`src/lib/serialize.ts`).

#### 4. Regras de integridade no banco

Regras que antes só a aplicação garantia agora o banco também garante:

| Regra | Antes (MongoDB) | Agora (Postgres) |
|---|---|---|
| Corrida aponta para um motorista existente | nada impedia | `FOREIGN KEY` |
| Um veículo por motorista | `findOne` + `create` (sujeito a corrida) | `UNIQUE (driver_id)` |
| Folgas sem sobreposição | `findOne` + `create` (sujeito a corrida) | `EXCLUDE USING gist` com `daterange` |
| Preço por km entre 0 e 50 | só o Zod | Zod + `CHECK` |
| Apagar usuário apaga o perfil | manual | `ON DELETE CASCADE` |

---

## Desnormalização intencional: `lucroTotal` e `totalCorridas`

Essas métricas aparecem no dashboard do motorista a cada acesso. Em vez de calcular a agregação a cada requisição:

```sql
SELECT SUM(COALESCE(lucro_liquido, valor)), COUNT(*)
FROM rides WHERE driver_id = $1 AND status = 'concluida';
```

guardamos os totais em `drivers` e lemos direto (O(1)).

**O risco** de qualquer desnormalização é o total divergir das corridas. No MongoDB isso podia acontecer: o hook `post('findOneAndUpdate')` rodava **depois** do update, fora de transação, e erros eram engolidos.

**Agora** a soma acontece **na mesma transação** que conclui a corrida (`changeRideStatus` em `src/services/rideService.ts`):

```sql
BEGIN;
  UPDATE rides SET status = 'concluida'
   WHERE id = $1 AND status = 'em_andamento';   -- condicional ao status lido
  -- 0 linhas afetadas → outra requisição já concluiu → ROLLBACK, responde 409
  UPDATE drivers SET lucro_total = lucro_total + $lucro, total_corridas = total_corridas + 1
   WHERE id = $driver;
  INSERT INTO notifications (...);
COMMIT;
```

Ou o conjunto inteiro acontece, ou nada acontece. O `WHERE status = <lido>` impede somar duas vezes quando há dois "concluir" simultâneos. O segundo `UPDATE` espera o lock da linha e, quando o primeiro faz commit, o `WHERE` não casa mais, então nada é somado. O teste `concluir repetido ou simultâneo soma o lucro uma única vez` cobre esse caso.

---

## Comparativo: MongoDB (versão anterior) vs Postgres (atual)

| Aspecto | MongoDB + Mongoose | Postgres + Prisma |
|---|---|---|
| Estrutura | Coleções com referências por ObjectId | Tabelas normalizadas com FK |
| Joins | `populate` (várias queries) | `include`/`select` (JOIN no banco) |
| Integridade referencial | Responsabilidade da aplicação | Garantida pelo SGBD (FK, UNIQUE, CHECK, EXCLUDE) |
| Transações | `session.startTransaction()` (exige replica set) | `prisma.$transaction(async (tx) => ...)` |
| "Triggers" | Hooks `pre`/`post` do Mongoose | Funções de serviço transacionais |
| Agregados (lucro, contagem) | Hook fora de transação | Mesma transação da mudança de status |
| Schema | Flexível (validado no app) | Rígido (migrations versionadas em `prisma/migrations`) |
| Identificadores | ObjectId | UUID |
| Arquivos (avatar) | GridFS | Supabase Storage (bucket privado) |
