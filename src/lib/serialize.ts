// =============================================================================
// Serializer central: converte linhas do Prisma no MESMO JSON que a API
// devolvia com o Mongoose, para o frontend não perceber a troca de banco.
// -----------------------------------------------------------------------------
//   id                -> _id               (em qualquer nível)
//   Decimal           -> number            (valor, precoKm, lucroTotal...)
//   Date em "data"    -> "YYYY-MM-DD"      (coluna DATE da corrida)
//   Date em "hora"    -> "HH:MM"           (coluna TIME da corrida)
//   outras Date       -> ISO 8601          (createdAt, dataInicio... como antes)
//   null              -> campo omitido     (o Mongo não gravava opcionais vazios)
//
// Atenção: valores null intencionais (ex.: `vehicle: null`) devem ser
// colocados DEPOIS de serializar, senão são omitidos.
// =============================================================================
import { Prisma } from '@prisma/client';

const pad = (n: number) => String(n).padStart(2, '0');

// DATE e TIME chegam do Prisma como Date em UTC (meia-noite / 1970-01-01).
export const formatDate = (d: Date) => d.toISOString().slice(0, 10);
export const formatTime = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

// Conversões de entrada (string da API -> Date para o Prisma)
export const parseDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const parseTime = (s: string) => new Date(`1970-01-01T${s}:00.000Z`);

export function serialize(value: any, key?: string): any {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) {
    if (key === 'data') return formatDate(value);
    if (key === 'hora') return formatTime(value);
    return value.toISOString();
  }
  if (Array.isArray(value)) return value.map((v) => serialize(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined) continue;
      out[k === 'id' ? '_id' : k] = serialize(v, k);
    }
    return out;
  }
  return value;
}
