import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth';
import Vehicle from '../models/Vehicle';
import Driver from '../models/Driver';

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

export const createVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = vehicleSchema.parse(req.body);

    const driver = await Driver.findById(data.driverId);
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }

    const authReq = req as AuthenticatedRequest;
    if (driver.userId.toString() !== authReq.user._id.toString()) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    const existing = await Vehicle.findOne({ driverId: data.driverId });
    if (existing) { res.status(409).json({ error: 'Motorista já possui um veículo cadastrado.' }); return; }

    const vehicle = await Vehicle.create(data);
    res.status(201).json(vehicle);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (err.code === 11000) { res.status(409).json({ error: 'Placa já cadastrada.' }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export const getVehicleByDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const vehicle = await Vehicle.findOne({ driverId: req.params.driverId });
    if (!vehicle) { res.status(404).json({ error: 'Veículo não encontrado.' }); return; }
    res.json(vehicle);
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

export const updateVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = updateVehicleSchema.parse(req.body);
    const vehicle = await Vehicle.findById(req.params.vehicleId);
    if (!vehicle) { res.status(404).json({ error: 'Veículo não encontrado.' }); return; }

    const driver = await Driver.findById(vehicle.driverId);
    const authReq = req as AuthenticatedRequest;
    if (!driver || driver.userId.toString() !== authReq.user._id.toString()) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    const updated = await Vehicle.findByIdAndUpdate(req.params.vehicleId, data, { new: true });
    res.json(updated);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (err.code === 11000) { res.status(409).json({ error: 'Placa já cadastrada.' }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export const deleteVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const vehicle = await Vehicle.findById(req.params.vehicleId);
    if (!vehicle) { res.status(404).json({ error: 'Veículo não encontrado.' }); return; }

    const driver = await Driver.findById(vehicle.driverId);
    const authReq = req as AuthenticatedRequest;
    if (!driver || driver.userId.toString() !== authReq.user._id.toString()) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    await vehicle.deleteOne();
    res.status(204).send();
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};
