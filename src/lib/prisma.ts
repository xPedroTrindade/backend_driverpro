// =============================================================================
// Client único do Prisma para toda a aplicação.
// -----------------------------------------------------------------------------
// - DATABASE_URL (pooler, porta 6543, ?pgbouncer=true) é lida aqui, em runtime.
// - passwordHash é omitido por padrão em TODAS as consultas (equivale ao
//   `select: false` do Mongoose). Só o login pede o hash explicitamente.
// =============================================================================
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  omit: { user: { passwordHash: true } },
});

// Tipo do client recebido dentro de prisma.$transaction(async (tx) => ...)
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
