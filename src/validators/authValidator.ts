import { z } from 'zod';

export const registerSchema = z.object({
  nome: z.string({ error: 'O nome é obrigatório.' })
    .min(2, 'O nome deve ter pelo menos 2 caracteres.')
    .trim(),

  email: z.string({ error: 'O email é obrigatório.' })
    .email('Email inválido.'),

  telefone: z.string({ error: 'O telefone é obrigatório.' })
    .min(10, 'Telefone inválido.')
    .max(15, 'Telefone inválido.'),

  tipo: z.enum(['motorista', 'passageiro'] as const, {
    error: 'Tipo deve ser "motorista" ou "passageiro".'
  }),

  precoKm: z.number({ error: 'Preço por km deve ser um número.' })
    .positive('Preço por km deve ser maior que zero.')
    .max(50, 'Preço por km não pode ultrapassar R$ 50.')
    .optional()

}).refine(
  (data) => data.tipo !== 'motorista' || data.precoKm !== undefined,
  { message: 'Preço por km é obrigatório para motoristas.', path: ['precoKm'] }
);

export type RegisterInput = z.infer<typeof registerSchema>;
