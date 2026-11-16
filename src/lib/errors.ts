// =============================================================================
// Reconhecimento de erros do Prisma/Postgres (equivalentes aos do Mongoose).
// =============================================================================
import { Prisma } from '@prisma/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

const known = (err: unknown, code: string): err is Prisma.PrismaClientKnownRequestError =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

// ID que não é um UUID válido (equivale ao CastError do Mongoose).
export const isInvalidId = (err: unknown) => known(err, 'P2023');

// Registro não encontrado em update/delete.
export const isNotFound = (err: unknown) => known(err, 'P2025');

// Violação de UNIQUE (equivale ao código 11000 do Mongo). `field` filtra pela coluna.
export const isUniqueViolation = (err: unknown, field?: string) =>
  known(err, 'P2002') && (!field || JSON.stringify(err.meta?.target ?? '').includes(field));

// Violação de EXCLUDE (SQLSTATE 23P01) — ex.: folgas sobrepostas.
// O Prisma não mapeia esse código, então ele chega como erro "desconhecido".
export const isExclusionViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientUnknownRequestError && err.message.includes('23P01');
