import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { serialize, parseDate } from '../lib/serialize';
import { isExclusionViolation } from '../lib/errors';

const periodSchema = z.object({
  driverId: z.string().min(1),
  dataInicio: z.string().date('Data de início inválida.'),
  dataFim: z.string().date('Data de fim inválida.'),
  motivo: z.enum(['manutencao', 'descanso', 'compromisso_pessoal', 'outros']).optional(),
}).refine(d => new Date(d.dataFim) >= new Date(d.dataInicio), {
  message: 'Data de fim deve ser maior ou igual à data de início.',
  path: ['dataFim'],
});

const SOBREPOSICAO = 'Período se sobrepõe a um já cadastrado.';

export const getPeriods = async (req: Request, res: Response): Promise<void> => {
  try {
    const periods = await prisma.unavailablePeriod.findMany({
      where: { driverId: req.params.driverId as string },
      orderBy: { dataInicio: 'asc' },
    });
    res.json(serialize(periods));
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

export const createPeriod = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = periodSchema.parse(req.body);

    const driver = await prisma.driver.findUnique({ where: { id: data.driverId }, select: { userId: true } });
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }

    const authReq = req as AuthenticatedRequest;
    if (driver.userId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    // A EXCLUDE do banco (unavailable_periods_sem_sobreposicao) é quem garante
    // que folgas não se sobrepõem, inclusive com requisições simultâneas.
    const period = await prisma.unavailablePeriod.create({
      data: {
        driverId: data.driverId,
        dataInicio: parseDate(data.dataInicio),
        dataFim: parseDate(data.dataFim),
        motivo: data.motivo,
      },
    });
    res.status(201).json(serialize(period));
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (isExclusionViolation(err)) { res.status(409).json({ error: SOBREPOSICAO }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export const deletePeriod = async (req: Request, res: Response): Promise<void> => {
  try {
    const period = await prisma.unavailablePeriod.findUnique({
      where: { id: req.params.periodId as string },
      include: { driver: { select: { userId: true } } },
    });
    if (!period) { res.status(404).json({ error: 'Período não encontrado.' }); return; }

    const authReq = req as AuthenticatedRequest;
    if (period.driver.userId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    await prisma.unavailablePeriod.delete({ where: { id: period.id } });
    res.status(204).send();
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};
