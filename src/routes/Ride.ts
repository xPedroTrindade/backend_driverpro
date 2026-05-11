import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { ownershipMiddleware } from '../middlewares/ownership';

const router = Router();

// POST /api/rides — criar corrida (driverId vem do body)
router.post('/', authMiddleware, ownershipMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// GET /api/rides/driver/:driverId — listar corridas do motorista
router.get('/driver/:driverId', authMiddleware, ownershipMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// PUT /api/rides/:rideId/status — aceitar / concluir / cancelar
router.put('/:rideId/status', authMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

export default router;
