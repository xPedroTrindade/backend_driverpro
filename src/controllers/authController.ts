import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { registerSchema, loginSchema } from '../validators/authValidator';
import { registerUser, loginUser } from '../services/authService';

export const register = async (req: Request, res: Response): Promise<void> => {
  console.log('[register] body recebido:', JSON.stringify(req.body));
  try {
    const payload = registerSchema.parse(req.body);
    const result = await registerUser(payload);
    console.log('[register] sucesso para:', payload.email);
    res.status(201).json(result);
  } catch (err) {
    console.error('[register] erro:', err);
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

    if ((err as any)?.code === 11000) {
      res.status(409).json({ error: 'Email já cadastrado.' });
      return;
    }

    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, senha } = loginSchema.parse(req.body);
    const result = await loginUser(email, senha);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(422).json({ error: 'Dados inválidos.' });
      return;
    }

    const known = err as { status?: number; message?: string };
    if (known.status) {
      res.status(known.status).json({ error: known.message });
      return;
    }

    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
