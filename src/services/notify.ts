// =============================================================================
// services/notify.ts — Notifica um usuário (in-app + e-mail)
// -----------------------------------------------------------------------------
// Cria a notificação in-app (modelo Notification) e dispara o e-mail (stub).
// Centraliza os eventos do novo fluxo de corrida (orçamento, confirmação, etc.).
// =============================================================================

import Notification from '../models/Notification';
import User from '../models/User';
import { sendMail } from './mailer';

interface NotifyInput {
    tipo: string;
    titulo: string;
    corpo: string;
    rideId: any;
}

export async function notifyUser(userId: any, { tipo, titulo, corpo, rideId }: NotifyInput): Promise<void> {
    try {
        // cast para any: os models deste projeto não usam interfaces tipadas do Mongoose
        await Notification.create({ userId, tipo, titulo, corpo, rideId, lida: false } as any);

        const user = await User.findById(userId).select('email');
        if (user?.email) {
            await sendMail({ to: user.email, subject: titulo, text: corpo });
        }
    } catch (err) {
        console.error('Erro ao notificar usuário:', err);
    }
}
