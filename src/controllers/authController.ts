import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { registerSchema } from '../validators/authValidator';
import { registerUser } from '../services/authService';
import { FirebaseRequest } from '../middlewares/verifyToken';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = registerSchema.parse(req.body);
    const { firebaseUid } = req as FirebaseRequest;

    const user = await registerUser(firebaseUid, payload);

    res.status(201).json({ user });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(422).json({
        error: 'Dados inválidos.',
        detalhes: err.issues.map((e: any) => ({ campo: e.path.join('.'), mensagem: e.message }))
      });
      return;
    }

    const known = err as { status?: number; message?: string };
    if (known.status) {
      res.status(known.status).json({ error: known.message });
      return;
    }

    // Erro de chave duplicada do MongoDB (race condition)
    if ((err as any)?.code === 11000) {
      res.status(409).json({ error: 'Email ou conta já cadastrada.' });
      return;
    }

    console.error('Erro no registro:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
