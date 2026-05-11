import { Request, Response, NextFunction } from 'express';
import Driver from '../models/Driver';

// Garante que o driverId da rota pertence ao usuário autenticado.
// Deve ser usado DEPOIS do authMiddleware.
export const ownershipMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const driverId = req.params.driverId ?? req.body?.driverId;

  if (!driverId) {
    next();
    return;
  }

  try {
    const driver = await Driver.findById(driverId);

    if (!driver) {
      res.status(404).json({ error: 'Motorista não encontrado.' });
      return;
    }

    if (driver.userId.toString() !== req.user!._id.toString()) {
      res.status(403).json({ error: 'Acesso negado: este recurso pertence a outro usuário.' });
      return;
    }

    next();
  } catch {
    res.status(400).json({ error: 'driverId inválido.' });
  }
};
