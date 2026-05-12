import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebase';
import User from '../models/User';

export interface AuthenticatedRequest extends Request {
  user: any;
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    const user = await User.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      res.status(401).json({ error: 'Usuário não encontrado. Faça o cadastro primeiro.' });
      return;
    }

    (req as AuthenticatedRequest).user = user as any;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};
