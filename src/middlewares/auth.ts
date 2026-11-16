import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Usuário autenticado (o client omite passwordHash por padrão).
export type AuthUser = Omit<User, 'passwordHash'>;

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; tipo: string };

    // Tokens antigos (ObjectId do Mongo) caem no catch: id não é UUID -> 401.
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      res.status(401).json({ error: 'Usuário não encontrado.' });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};
