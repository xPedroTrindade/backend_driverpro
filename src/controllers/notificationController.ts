import { Request, Response } from 'express';
import Notification from '../models/Notification';
import { AuthenticatedRequest } from '../middlewares/auth';

// GET /api/notifications
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const notifications = await Notification.find({ userId: authReq.user._id })
      .sort({ criadoEm: -1 })
      .limit(50);
    res.json(notifications);
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// PUT /api/notifications/:notifId/read
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.notifId, userId: authReq.user._id },
      { lida: true },
      { new: true }
    );
    if (!notif) { res.status(404).json({ error: 'Notificação não encontrada.' }); return; }
    res.json(notif);
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// PUT /api/notifications/read-all
export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    await Notification.updateMany({ userId: authReq.user._id, lida: false }, { lida: true });
    res.json({ message: 'Todas as notificações foram marcadas como lidas.' });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// GET /api/notifications/unread-count
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const count = await Notification.countDocuments({ userId: authReq.user._id, lida: false });
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
