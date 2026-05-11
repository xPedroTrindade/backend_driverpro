import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { ownershipMiddleware } from '../middlewares/ownership';

const router = Router();

// POST /api/vehicles — cadastrar veículo (driverId vem do body)
router.post('/', authMiddleware, ownershipMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// GET /api/vehicles/driver/:driverId — buscar veículo do motorista
router.get('/driver/:driverId', authMiddleware, ownershipMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// PUT /api/vehicles/:vehicleId — editar veículo
router.put('/:vehicleId', authMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

// DELETE /api/vehicles/:vehicleId — excluir veículo
router.delete('/:vehicleId', authMiddleware, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Controller ainda não implementado.' });
});

export default router;
