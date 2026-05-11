import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { ownershipMiddleware } from '../middlewares/ownership';

const router = Router();

// GET /api/unavailable-periods/driver/:driverId — listar períodos
router.get('/driver/:driverId', authMiddleware, ownershipMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// POST /api/unavailable-periods — criar período (driverId vem do body)
router.post('/', authMiddleware, ownershipMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// DELETE /api/unavailable-periods/:periodId — remover período
router.delete('/:periodId', authMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

export default router;
