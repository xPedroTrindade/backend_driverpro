// =============================================================================
// services/notify.ts — Notificações de um usuário (in-app + e-mail)
// -----------------------------------------------------------------------------
// - createNotification: grava a notificação in-app DENTRO da transação de quem
//   chamou (recebe o `tx`), para nascer junto com a mudança na corrida.
// - emailUser: e-mail (stub), best-effort e FORA da transação: falha de e-mail
//   nunca desfaz a operação.
// =============================================================================
import type { NotificationTipo } from '@prisma/client';
import { prisma, Tx } from '../lib/prisma';
import { sendMail } from './mailer';

export interface NotifyInput {
  tipo: NotificationTipo;
  titulo: string;
  corpo: string;
  rideId: string;
}

export function createNotification(tx: Tx, userId: string, input: NotifyInput) {
  return tx.notification.create({ data: { userId, ...input } });
}

export async function emailUser(userId: string, subject: string, text: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email) await sendMail({ to: user.email, subject, text });
  } catch (err) {
    console.error('Erro ao enviar e-mail ao usuário:', err);
  }
}
