# Procedures e Triggers — SQL vs Serviços Transacionais (Prisma)

## Contexto

O DriverPro usa **PostgreSQL** (Supabase) com **Prisma**. O Postgres suporta procedures e triggers (PL/pgSQL). Mesmo assim, a lógica de negócio fica na **camada de serviço** em TypeScript, executada dentro de **transações** do Prisma:

- fica junto do resto da regra de negócio e é coberta pelos testes de contrato (`tests/`);
- é versionada e revisada como código, sem lógica escondida no banco;
- os textos das notificações e o envio de e-mail (que não cabem num trigger) ficam no mesmo lugar.

O banco continua responsável pela **integridade**: FK, UNIQUE, CHECK e EXCLUDE (ver `denormalization.md`).

Este documento mostra, para fins acadêmicos, o equivalente em PL/pgSQL de cada lógica e como ela foi implementada no projeto.

---

## PROCEDURE — Registro de Usuário

### Equivalente SQL (PL/pgSQL)

```sql
CREATE PROCEDURE sp_registrar_usuario(
  p_nome TEXT, p_email TEXT, p_password_hash TEXT, p_telefone TEXT,
  p_tipo "UserTipo", p_preco_km DECIMAL DEFAULT 0
)
LANGUAGE plpgsql AS $$
DECLARE v_user_id UUID := gen_random_uuid();
BEGIN
  -- Consistência: e-mail duplicado (o UNIQUE também barraria)
  IF EXISTS (SELECT 1 FROM users WHERE email = lower(p_email)) THEN
    RAISE EXCEPTION 'Este email já está cadastrado.' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO users (id, nome, email, password_hash, telefone, tipo, updated_at)
  VALUES (v_user_id, p_nome, lower(p_email), p_password_hash, p_telefone, p_tipo, now());

  IF p_tipo = 'motorista' THEN
    INSERT INTO drivers (id, user_id, preco_km, updated_at) VALUES (gen_random_uuid(), v_user_id, p_preco_km, now());
  ELSE
    INSERT INTO passengers (id, user_id, updated_at) VALUES (gen_random_uuid(), v_user_id, now());
  END IF;
  -- Uma CALL roda numa transação: se qualquer INSERT falhar, nada fica gravado.
END $$;
```

### Implementação — `src/services/authService.ts`

| Conceito SQL | Equivalente no projeto |
|---|---|
| `BEGIN ... COMMIT` | *Nested create* do Prisma: `user.create({ data: { ..., driver: { create } } })` é atômico |
| `IF EXISTS (SELECT ...)` | `prisma.user.findUnique({ where: { email } })` |
| `RAISE EXCEPTION` | `throw { status: 409, message: '...' }` |
| Corrida entre dois cadastros iguais | O `UNIQUE (email)` barra; o erro P2002 é traduzido em 409 |
| `lower(p_email)` | Zod: `z.string().trim().toLowerCase().email()` |

```typescript
const user = await prisma.user.create({
  data: {
    nome, email, telefone, tipo,
    passwordHash: await hashPassword(senha),
    ...(tipo === 'motorista'
      ? { driver: { create: { precoKm: precoKm ?? 0 } } }
      : { passenger: { create: {} } }),
  },
});
```

---

## TRIGGER — Notificar o Motorista ao Criar Corrida

### Equivalente SQL (PL/pgSQL)

```sql
CREATE FUNCTION fn_notificar_nova_corrida() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notifications (id, user_id, ride_id, tipo, titulo, corpo)
  SELECT gen_random_uuid(), d.user_id, NEW.id, 'nova_corrida', 'Novo Pedido de Corrida!',
         'Você tem um novo pedido de ' || NEW.passageiro_nome || '.'
  FROM drivers d WHERE d.id = NEW.driver_id;
  RETURN NEW;
END $$;

CREATE TRIGGER tr_notificar_nova_corrida AFTER INSERT ON rides
FOR EACH ROW EXECUTE FUNCTION fn_notificar_nova_corrida();
```

### Implementação — `rideService.createRide()`

A corrida e a notificação nascem na mesma transação: não existe corrida sem aviso, nem aviso sem corrida.

```typescript
return prisma.$transaction(async (tx) => {
  const ride = await tx.ride.create({ data });
  await createNotification(tx, driverUserId, { tipo: 'nova_corrida', ... });
  return ride;
});
```

---

## TRIGGER — Atualizar Estatísticas ao Concluir Corrida

### Equivalente SQL (PL/pgSQL)

```sql
CREATE FUNCTION fn_estatisticas_motorista() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Só reage quando o status mudou para 'concluida'
  IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    UPDATE drivers
       SET lucro_total    = lucro_total + COALESCE(NEW.lucro_liquido, NEW.valor),
           total_corridas = total_corridas + 1,
           updated_at     = now()
     WHERE id = NEW.driver_id;

    INSERT INTO notifications (id, user_id, ride_id, tipo, titulo, corpo)
    SELECT gen_random_uuid(), d.user_id, NEW.id, 'corrida_concluida', 'Corrida Concluída',
           'Corrida de ' || NEW.passageiro_nome || ' concluída. +R$ '
           || to_char(COALESCE(NEW.lucro_liquido, NEW.valor), 'FM999999990.00') || ' no seu lucro.'
    FROM drivers d WHERE d.id = NEW.driver_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tr_estatisticas_motorista AFTER UPDATE OF status ON rides
FOR EACH ROW EXECUTE FUNCTION fn_estatisticas_motorista();
```

### Implementação — `rideService.changeRideStatus()`

| Conceito SQL | Equivalente no projeto |
|---|---|
| `AFTER UPDATE OF status` | A própria função que muda o status |
| `OLD.status <> 'concluida'` | `updateMany({ where: { id, status: from } })`: só muda se ainda estiver no status lido |
| `UPDATE drivers SET lucro_total = ...` | `tx.driver.update({ data: { lucroTotal: { increment } } })` |
| `INSERT INTO notifications` | `createNotification(tx, ...)` |
| Tudo na transação do UPDATE | `prisma.$transaction(async (tx) => ...)` |

```typescript
return prisma.$transaction(async (tx) => {
  const { count } = await tx.ride.updateMany({ where: { id: rideId, status: from }, data: { status: to } });
  if (count === 0) return null; // outra requisição mudou a corrida → 409, nada somado

  const ride = await tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  const lucro = ride.lucroLiquido ?? ride.valor;

  if (to === 'concluida') {
    await tx.driver.update({
      where: { id: ride.driverId },
      data: { lucroTotal: { increment: lucro }, totalCorridas: { increment: 1 } },
    });
  }
  // Avisos: cancelar avisa só a outra parte; iniciar/concluir avisam motorista e passageiro.
  if (avisarMotorista) await createNotification(tx, driverUserId, { ...AVISO_MOTORISTA[to](ride, lucro), rideId });
  if (avisarPassageiro) await createNotification(tx, ride.passageiroId!, { ...AVISO_PASSAGEIRO[to](ride), rideId });
  return ride;
});
```

Os mesmos padrões valem para o orçamento (`quoteRide`) e a confirmação (`confirmRide`). O e-mail sai **depois** do commit, porque falha de e-mail não deve desfazer a operação.

---

## "TRIGGER" — Hash de Senha

No Mongoose era um hook `pre('save')`. Em SQL não há bcrypt nativo, e o hash **deve** ser feito na aplicação: a senha em texto puro nunca deve chegar ao banco, nem a logs de query. A função `hashPassword()` (`src/services/authService.ts`) é chamada explicitamente antes de cada `create`.

---

## Resumo Comparativo

| Recurso SQL | Implementação | Arquivo |
|---|---|---|
| `sp_registrar_usuario` | `registerUser()` com *nested create* | `src/services/authService.ts` |
| `tr_notificar_nova_corrida` | `createRide()` em transação | `src/services/rideService.ts` |
| `tr_estatisticas_motorista` | `changeRideStatus()` em transação | `src/services/rideService.ts` |
| Hash de senha | `hashPassword()` (bcrypt) | `src/services/authService.ts` |
| `BEGIN / COMMIT / ROLLBACK` | `prisma.$transaction(async (tx) => ...)` | `src/services/rideService.ts` |
| `RAISE EXCEPTION` | `throw { status, message }` / resposta 409 | services e controllers |
| CHECK / UNIQUE / EXCLUDE / FK | No próprio banco | `prisma/migrations/.../migration.sql` |
