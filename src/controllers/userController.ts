import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth';
import User from '../models/User';

const updateProfileSchema = z.object({
  nome: z.string().min(2).trim().optional(),
  telefone: z.string().min(10).max(15).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'Nenhum campo para atualizar.' });

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado.' }); return; }
    res.json(user);
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user._id.toString() !== req.params.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }
    const data = updateProfileSchema.parse(req.body);
    const user = await User.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado.' }); return; }
    res.json(user);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    res.status(400).json({ error: 'Requisição inválida.' });
  }
};

function getBucket(): GridFSBucket {
  return new GridFSBucket(mongoose.connection.db!, { bucketName: 'avatars' });
}

export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    if (authReq.user._id.toString() !== id) {
      res.status(403).json({ error: 'Acesso negado: você só pode alterar seu próprio avatar.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }

    const bucket = getBucket();
    const filename = `avatar-${id}`;

    // Remove arquivo anterior se existir
    const existing = await bucket.find({ filename }).toArray();
    for (const f of existing) {
      await bucket.delete(f._id);
    }

    // Faz upload do novo arquivo
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: { contentType: req.file.mimetype },
    });

    await new Promise<void>((resolve, reject) => {
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
      uploadStream.end(req.file!.buffer);
    });

    const avatarUrl = `/api/users/${id}/avatar`;
    await User.findByIdAndUpdate(id, { avatarUrl });

    res.status(200).json({ avatarUrl });
  } catch (err) {
    console.error('Erro no upload de avatar:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export const getAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const bucket = getBucket();
    const filename = `avatar-${id}`;

    const files = await bucket.find({ filename }).toArray();

    if (!files.length) {
      res.status(404).json({ error: 'Avatar não encontrado.' });
      return;
    }

    res.setHeader('Content-Type', files[0].metadata?.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    bucket.openDownloadStreamByName(filename).pipe(res);
  } catch (err) {
    console.error('Erro ao buscar avatar:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
