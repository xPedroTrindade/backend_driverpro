import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from './auth';

// Garante que o driverId da rota pertence ao usuário autenticado.
// Deve ser usado DEPOIS do authMiddleware.
export const ownershipMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const driverId = req.params.driverId ?? req.body?.driverId;

  if (!driverId) {
    next();
    return;
  }

  try {
    // ID que não é UUID lança P2023 -> cai no catch (400), como o CastError antes.
    const driver = await prisma.driver.findUnique({ where: { id: String(driverId) }, select: { userId: true } });

    if (!driver) {
      res.status(404).json({ error: 'Motorista não encontrado.' });
      return;
    }

    if (driver.userId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado: este recurso pertence a outro usuário.' });
      return;
    }

    next();
  } catch {
    res.status(400).json({ error: 'driverId inválido.' });
  }
};
