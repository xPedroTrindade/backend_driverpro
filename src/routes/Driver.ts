import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { ownershipMiddleware } from '../middlewares/ownership';

const router = Router();

// GET /api/drivers/:driverId — perfil do motorista
router.get('/:driverId', authMiddleware, ownershipMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// PUT /api/drivers/:driverId — atualizar disponibilidade / preço por km
router.put('/:driverId', authMiddleware, ownershipMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

export default router;
