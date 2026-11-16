import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { serialize } from '../lib/serialize';
import { isNotFound, isUuid } from '../lib/errors';
import { avatarStorage } from '../services/avatarStorage';

const updateProfileSchema = z.object({
  nome: z.string().min(2).trim().optional(),
  telefone: z.string().min(10).max(15).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'Nenhum campo para atualizar.' });

// Campos visíveis para outros usuários (sem email/telefone)
const PUBLIC_PROFILE_FIELDS = { id: true, nome: true, tipo: true, avatarUrl: true } as const;

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = req.params.id as string;
    const isSelf = authReq.user.id === id;

    const user = isSelf
      ? await prisma.user.findUnique({ where: { id } })
      : await prisma.user.findUnique({ where: { id }, select: PUBLIC_PROFILE_FIELDS });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado.' }); return; }
    res.json(serialize(user));
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user.id !== req.params.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }
    const data = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: authReq.user.id }, data });
    res.json(serialize(user));
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (isNotFound(err)) { res.status(404).json({ error: 'Usuário não encontrado.' }); return; }
    res.status(400).json({ error: 'Requisição inválida.' });
  }
};

export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = req.params.id as string;

    if (authReq.user.id !== id) {
      res.status(403).json({ error: 'Acesso negado: você só pode alterar seu próprio avatar.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }

    // Um arquivo por usuário: o novo substitui o anterior (upsert no Storage).
    await avatarStorage().save(id, req.file.buffer, req.file.mimetype);

    // Continua relativo ao backend: o frontend monta `${baseURL}${avatarUrl}`.
    const avatarUrl = `/api/users/${id}/avatar`;
    await prisma.user.update({ where: { id }, data: { avatarUrl } });

    res.status(200).json({ avatarUrl });
  } catch (err) {
    console.error('Erro no upload de avatar:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export const getAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    // Rota pública: o id vira caminho no Storage, então só aceita UUID.
    const id = req.params.id as string;
    const avatar = isUuid(id) ? await avatarStorage().load(id) : null;

    if (!avatar) {
      res.status(404).json({ error: 'Avatar não encontrado.' });
      return;
    }

    res.setHeader('Content-Type', avatar.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(avatar.data);
  } catch (err) {
    console.error('Erro ao buscar avatar:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
