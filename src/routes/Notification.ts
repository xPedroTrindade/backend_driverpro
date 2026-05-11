import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// GET /api/notifications — listar notificações do usuário logado
router.get('/', authMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// PUT /api/notifications/:notifId/read — marcar como lida
router.put('/:notifId/read', authMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// PUT /api/notifications/read-all — marcar todas como lidas
router.put('/read-all', authMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

export default router;
