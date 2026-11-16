import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { serialize } from '../lib/serialize';
import { isUniqueViolation } from '../lib/errors';

const vehicleSchema = z.object({
  driverId: z.string().min(1),
  modelo: z.string().min(2).trim(),
  placa: z.string().min(7).max(8).trim().toUpperCase(),
  consumoMedio: z.number().positive().optional(),
  lugares: z.number().int().positive().max(100).optional(),
  aceitaPets: z.boolean().optional(),
  aceitaCadeirinha: z.boolean().optional(),
  aceitaVolumes: z.boolean().optional(),
});

const updateVehicleSchema = vehicleSchema.omit({ driverId: true }).partial()
  .refine(d => Object.keys(d).length > 0, { message: 'Nenhum campo para atualizar.' });

// UNIQUE violado: placa (entre motoristas) ou driver_id (um veículo por motorista).
function conflito(err: unknown): string | null {
  if (isUniqueViolation(err, 'placa')) return 'Placa já cadastrada.';
  if (isUniqueViolation(err)) return 'Motorista já possui um veículo cadastrado.';
  return null;
}

// Veículo + userId do dono (para checar se pertence ao usuário logado).
const findWithOwner = (id: string) =>
  prisma.vehicle.findUnique({ where: { id }, include: { driver: { select: { userId: true } } } });

export const createVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = vehicleSchema.parse(req.body);

    const driver = await prisma.driver.findUnique({ where: { id: data.driverId }, select: { userId: true } });
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }

    const authReq = req as AuthenticatedRequest;
    if (driver.userId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    const existing = await prisma.vehicle.findUnique({ where: { driverId: data.driverId }, select: { id: true } });
    if (existing) { res.status(409).json({ error: 'Motorista já possui um veículo cadastrado.' }); return; }

    const vehicle = await prisma.vehicle.create({ data });
    res.status(201).json(serialize(vehicle));
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    const msg = conflito(err);
    if (msg) { res.status(409).json({ error: msg }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export const getVehicleByDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const vehicle = await prisma.vehicle.findUnique({ where: { driverId: req.params.driverId as string } });
    if (!vehicle) { res.status(404).json({ error: 'Veículo não encontrado.' }); return; }
    res.json(serialize(vehicle));
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

export const updateVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = updateVehicleSchema.parse(req.body);
    const vehicle = await findWithOwner(req.params.vehicleId as string);
    if (!vehicle) { res.status(404).json({ error: 'Veículo não encontrado.' }); return; }

    const authReq = req as AuthenticatedRequest;
    if (vehicle.driver.userId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    const updated = await prisma.vehicle.update({ where: { id: vehicle.id }, data });
    res.json(serialize(updated));
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    const msg = conflito(err);
    if (msg) { res.status(409).json({ error: msg }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export const deleteVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const vehicle = await findWithOwner(req.params.vehicleId as string);
    if (!vehicle) { res.status(404).json({ error: 'Veículo não encontrado.' }); return; }

    const authReq = req as AuthenticatedRequest;
    if (vehicle.driver.userId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    res.status(204).send();
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};
