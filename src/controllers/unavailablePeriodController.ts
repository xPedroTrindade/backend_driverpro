import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth';
import UnavailablePeriod from '../models/UnavailablePeriod';
import Driver from '../models/Driver';

const periodSchema = z.object({
  driverId: z.string().min(1),
  dataInicio: z.string().date('Data de início inválida.'),
  dataFim: z.string().date('Data de fim inválida.'),
  motivo: z.enum(['manutencao', 'descanso', 'compromisso_pessoal', 'outros']).optional(),
}).refine(d => new Date(d.dataFim) >= new Date(d.dataInicio), {
  message: 'Data de fim deve ser maior ou igual à data de início.',
  path: ['dataFim'],
});

export const getPeriods = async (req: Request, res: Response): Promise<void> => {
  try {
    const periods = await UnavailablePeriod.find({ driverId: req.params.driverId }).sort({ dataInicio: 1 });
    res.json(periods);
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

export const createPeriod = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = periodSchema.parse(req.body);

    const driver = await Driver.findById(data.driverId);
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }

    const authReq = req as AuthenticatedRequest;
    if (driver.userId.toString() !== authReq.user._id.toString()) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    // Verifica sobreposição
    const overlap = await UnavailablePeriod.findOne({
      driverId: data.driverId,
      dataInicio: { $lte: new Date(data.dataFim) },
      dataFim: { $gte: new Date(data.dataInicio) },
    });
    if (overlap) {
      res.status(409).json({ error: 'Período se sobrepõe a um já cadastrado.' }); return;
    }

    const period = await UnavailablePeriod.create({
      ...data,
      dataInicio: new Date(data.dataInicio),
      dataFim: new Date(data.dataFim),
    });
    res.status(201).json(period);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export const deletePeriod = async (req: Request, res: Response): Promise<void> => {
  try {
    const period = await UnavailablePeriod.findById(req.params.periodId);
    if (!period) { res.status(404).json({ error: 'Período não encontrado.' }); return; }

    const driver = await Driver.findById(period.driverId);
    const authReq = req as AuthenticatedRequest;
    if (!driver || driver.userId.toString() !== authReq.user._id.toString()) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    await period.deleteOne();
    res.status(204).send();
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};
