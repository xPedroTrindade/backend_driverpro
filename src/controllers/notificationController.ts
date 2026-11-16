import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { serialize } from '../lib/serialize';
import { isNotFound } from '../lib/errors';

// GET /api/notifications
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const notifications = await prisma.notification.findMany({
      where: { userId: authReq.user.id },
      orderBy: { criadoEm: 'desc' },
      take: 50,
    });
    res.json(serialize(notifications));
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// PUT /api/notifications/:notifId/read
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    // where com userId: notificação de outro usuário = não encontrada (404)
    const notif = await prisma.notification.update({
      where: { id: req.params.notifId as string, userId: authReq.user.id },
      data: { lida: true },
    });
    res.json(serialize(notif));
  } catch (err) {
    if (isNotFound(err)) { res.status(404).json({ error: 'Notificação não encontrada.' }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// PUT /api/notifications/read-all
export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    await prisma.notification.updateMany({ where: { userId: authReq.user.id, lida: false }, data: { lida: true } });
    res.json({ message: 'Todas as notificações foram marcadas como lidas.' });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// GET /api/notifications/unread-count
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const count = await prisma.notification.count({ where: { userId: authReq.user.id, lida: false } });
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
