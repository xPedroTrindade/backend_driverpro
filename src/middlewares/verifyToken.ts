import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebase';

// Middleware leve para registro: só verifica o Firebase token,
// sem buscar o usuário no MongoDB (ele ainda não existe).
export interface FirebaseRequest extends Request {
  firebaseUid: string;
  firebaseEmail: string;
}

export const verifyTokenMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    (req as FirebaseRequest).firebaseUid = decoded.uid;
    (req as FirebaseRequest).firebaseEmail = decoded.email ?? '';
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};
