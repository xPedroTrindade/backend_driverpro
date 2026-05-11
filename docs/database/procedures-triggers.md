# Procedures e Triggers — SQL vs MongoDB/Mongoose

## Contexto

O projeto DriverPro utiliza MongoDB como banco de dados. MongoDB não possui suporte nativo a stored procedures ou triggers SQL. Este documento apresenta:

1. O equivalente SQL de cada lógica implementada (para fins acadêmicos)
2. Como a mesma lógica foi implementada no projeto usando Node.js/Mongoose

---

## PROCEDURE — Registro de Usuário

### Equivalente SQL (T-SQL / SQL Server)

```sql
CREATE PROCEDURE sp_RegistrarUsuario
    @firebaseUid  VARCHAR(128),
    @nome         VARCHAR(100),
    @email        VARCHAR(255),
    @telefone     VARCHAR(15),
    @tipo         VARCHAR(20),
    @precoKm      DECIMAL(5,2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    -- Consistência 1: e-mail duplicado
    IF EXISTS (SELECT 1 FROM users WHERE email = @email)
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('Este e-mail já está cadastrado.', 16, 1);
        RETURN;
    END

    -- Consistência 2: firebaseUid duplicado
    IF EXISTS (SELECT 1 FROM users WHERE firebase_uid = @firebaseUid)
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('Esta conta Firebase já está cadastrada.', 16, 1);
        RETURN;
    END

    -- Consistência 3: precoKm obrigatório para motorista
    IF @tipo = 'motorista' AND (@precoKm IS NULL OR @precoKm <= 0)
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('Preço por km é obrigatório e deve ser maior que zero para motoristas.', 16, 1);
        RETURN;
    END

    DECLARE @userId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO users (id, firebase_uid, nome, email, telefone, tipo, created_at, updated_at)
    VALUES (@userId, @firebaseUid, @nome, @email, @telefone, @tipo, GETDATE(), GETDATE());

    IF @tipo = 'motorista'
    BEGIN
        INSERT INTO drivers (id, user_id, preco_km, conta_verificada, disponivel, total_corridas, lucro_total)
        VALUES (NEWID(), @userId, @precoKm, 0, 1, 0, 0);
    END
    ELSE
    BEGIN
        INSERT INTO passengers (id, user_id)
        VALUES (NEWID(), @userId);
    END

    COMMIT TRANSACTION;

    -- Retorna o usuário criado
    SELECT id, nome, email, tipo, created_at FROM users WHERE id = @userId;
END;
GO
```

### Implementação MongoDB — `src/services/authService.ts`

| Conceito SQL | Equivalente MongoDB/Node.js |
|---|---|
| `BEGIN TRANSACTION` | `session.startTransaction()` |
| `COMMIT TRANSACTION` | `session.commitTransaction()` |
| `ROLLBACK TRANSACTION` | `session.abortTransaction()` |
| `RAISERROR(msg, 16, 1)` | `throw { status: 409, message: '...' }` |
| `IF EXISTS (SELECT ...)` | `await User.findOne({ email })` |
| `INSERT INTO users` | `await User.create([...], { session })` |
| `INSERT INTO drivers` | `await Driver.create([...], { session })` |

```typescript
// src/services/authService.ts (simplificado)
export const registerUser = async (firebaseUid: string, data: RegisterInput) => {

  // Consistência: email/firebaseUid duplicado → equivalente ao IF EXISTS + RAISERROR
  const existing = await User.findOne({ $or: [{ email: data.email }, { firebaseUid }] });
  if (existing) {
    throw { status: 409, message: `Este ${conflict} já está cadastrado.` };
  }

  // Transação: equivalente ao BEGIN TRANSACTION
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [user] = await User.create([{ firebaseUid, ...data }], { session });

    if (data.tipo === 'motorista') {
      await Driver.create([{ userId: user._id, precoKm: data.precoKm }], { session });
    } else {
      await Passenger.create([{ userId: user._id }], { session });
    }

    await session.commitTransaction();  // equivalente ao COMMIT
    return user;

  } catch (err) {
    await session.abortTransaction();   // equivalente ao ROLLBACK
    throw err;
  } finally {
    session.endSession();
  }
};
```

---

## TRIGGER — Atualizar Estatísticas ao Concluir Corrida

### Equivalente SQL (T-SQL / SQL Server)

```sql
CREATE TRIGGER tr_AtualizarEstatisticasMotorista
ON rides
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Só dispara quando o status mudou para 'concluida'
    IF NOT EXISTS (
        SELECT 1 FROM inserted i
        JOIN deleted d ON i.id = d.id
        WHERE i.status = 'concluida' AND d.status <> 'concluida'
    )
    RETURN;

    -- Consistência: garante que o driver existe
    IF NOT EXISTS (SELECT 1 FROM drivers WHERE id IN (SELECT driver_id FROM inserted))
    BEGIN
        RAISERROR('Driver não encontrado para a corrida.', 16, 1);
        RETURN;
    END

    -- Atualiza lucro total e contador de corridas do motorista
    UPDATE d
    SET
        d.lucro_total    = d.lucro_total + i.valor,
        d.total_corridas = d.total_corridas + 1,
        d.updated_at     = GETDATE()
    FROM drivers d
    JOIN inserted i ON d.id = i.driver_id
    WHERE i.status = 'concluida';

    -- Insere notificação para o motorista
    INSERT INTO notifications (id, user_id, ride_id, tipo, titulo, corpo, lida, created_at)
    SELECT
        NEWID(),
        d.user_id,
        i.id,
        'corrida_concluida',
        'Corrida Concluída',
        CONCAT('Corrida de ', i.passageiro_nome, ' concluída. +R$ ',
               FORMAT(i.valor, 'N2'), ' no seu lucro.'),
        0,
        GETDATE()
    FROM inserted i
    JOIN drivers d ON d.id = i.driver_id
    WHERE i.status = 'concluida';
END;
GO
```

### Implementação MongoDB — `src/models/Ride.ts`

| Conceito SQL | Equivalente Mongoose |
|---|---|
| `AFTER UPDATE` | `schema.post('findOneAndUpdate', ...)` |
| `IF inserted.status = 'concluida'` | `if (doc.status === 'concluida')` |
| `UPDATE drivers SET lucro_total = ...` | `Driver.findByIdAndUpdate(..., { $inc: { lucroTotal: valor } })` |
| `INSERT INTO notifications` | `Notification.create(...)` |

```typescript
// src/models/Ride.ts (hook post-update)
rideSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) return;

  const driver = await Driver.findById(doc.driverId);
  if (!driver) return;

  // Atualiza estatísticas — equivalente ao UPDATE no trigger SQL
  if (doc.status === 'concluida') {
    await Driver.findByIdAndUpdate(doc.driverId, {
      $inc: { lucroTotal: doc.valor, totalCorridas: 1 }
    });
  }

  // Notificação — equivalente ao INSERT INTO notifications no trigger SQL
  if (doc.status === 'concluida') {
    await Notification.create({
      userId: driver.userId,
      rideId: doc._id,
      tipo: 'corrida_concluida',
      titulo: 'Corrida Concluída',
      corpo: `Corrida de ${doc.passageiroNome} concluída. +R$ ${doc.valor.toFixed(2)} no seu lucro.`,
      lida: false
    });
  }
});
```

---

## TRIGGER — Hash de Senha Antes de Salvar

### Equivalente SQL (T-SQL / SQL Server)

```sql
CREATE TRIGGER tr_HashSenhaUsuario
ON users
INSTEAD OF INSERT
AS
BEGIN
    SET NOCOUNT ON;

    -- Consistência: senha não pode ser vazia
    IF EXISTS (SELECT 1 FROM inserted WHERE password_hash IS NULL OR password_hash = '')
    BEGIN
        RAISERROR('A senha não pode ser vazia.', 16, 1);
        RETURN;
    END

    -- Em SQL puro não há bcrypt nativo — em produção usaria HASHBYTES com SHA2_256
    -- ou delegaria o hash à aplicação antes do INSERT.
    -- Aqui é representado como documentação do fluxo.
    INSERT INTO users (id, firebase_uid, nome, email, password_hash, telefone, tipo, created_at, updated_at)
    SELECT
        id,
        firebase_uid,
        nome,
        email,
        -- HASHBYTES('SHA2_256', CONVERT(VARBINARY, password_hash)) -- aproximação SQL
        password_hash,  -- hash já vem da aplicação
        telefone,
        tipo,
        GETDATE(),
        GETDATE()
    FROM inserted;
END;
GO
```

### Implementação MongoDB — `src/models/User.ts`

| Conceito SQL | Equivalente Mongoose |
|---|---|
| `INSTEAD OF INSERT` | `schema.pre('save', ...)` |
| `IF password_hash IS NULL` | `if (!this.passwordHash) return;` |
| `IF NOT UPDATE(password_hash)` | `if (!this.isModified('passwordHash')) return;` |
| Hash com bcrypt | `bcrypt.hash(this.passwordHash, 10)` |

```typescript
// src/models/User.ts
userSchema.pre('save', async function () {
  // Só executa se o campo foi definido ou alterado (equivalente ao IF UPDATE())
  if (!this.isModified('passwordHash') || !this.passwordHash) return;

  // Hash com bcrypt, salt 10 (equivalente ao HASHBYTES na aplicação)
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
});
```

---

## Resumo Comparativo

| Recurso SQL | Mongoose/Node.js | Arquivo |
|---|---|---|
| `sp_RegistrarUsuario` | `authService.registerUser()` | `src/services/authService.ts` |
| `tr_AtualizarEstatisticasMotorista` | `rideSchema.post('findOneAndUpdate')` | `src/models/Ride.ts` |
| `tr_HashSenhaUsuario` | `userSchema.pre('save')` | `src/models/User.ts` |
| `BEGIN TRANSACTION / COMMIT` | `session.startTransaction() / commitTransaction()` | `src/services/authService.ts` |
| `ROLLBACK TRANSACTION` | `session.abortTransaction()` | `src/services/authService.ts` |
| `RAISERROR` | `throw { status, message }` | `src/services/authService.ts` |
| `IF EXISTS` | `await Model.findOne(...)` | Services em geral |
