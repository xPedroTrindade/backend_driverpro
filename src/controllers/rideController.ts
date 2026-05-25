import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth';
import Ride from '../models/Ride';
import Driver from '../models/Driver';
import User from '../models/User';

const requestRideSchema = z.object({
  driverId: z.string().min(1),
  origem: z.string().min(2).trim(),
  destino: z.string().min(2).trim(),
  distanciaKm: z.number().positive(),
  data: z.string().date('Data inválida. Use YYYY-MM-DD.'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida. Use HH:MM.'),
});

const createRideSchema = z.object({
  driverId: z.string().min(1),
  passageiroNome: z.string().min(2).trim(),
  origem: z.string().min(2).trim(),
  destino: z.string().min(2).trim(),
  distanciaKm: z.number().positive(),
  valor: z.number().positive(),
  data: z.string().date('Data inválida. Use YYYY-MM-DD.'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida. Use HH:MM.'),
});

const statusSchema = z.object({
  status: z.enum(['em_andamento', 'concluida', 'cancelada']),
});

// 5.1 — POST /api/rides
export const createRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createRideSchema.parse(req.body);

    const driver = await Driver.findById(data.driverId);
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }

    const authReq = req as AuthenticatedRequest;
    if (driver.userId.toString() !== authReq.user._id.toString()) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    const ride = await Ride.create({ ...data, status: 'pendente' });
    res.status(201).json(ride);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 5.4 — GET /api/rides/driver/:driverId?date=YYYY-MM-DD
export const getRidesByDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, any> = { driverId: req.params.driverId };
    if (req.query.date) filter.data = req.query.date;

    const rides = await Ride.find(filter).sort({ data: 1, hora: 1 });
    res.json(rides);
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

// POST /api/rides/request — passageiro cria agendamento
export const requestRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = requestRideSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;

    const driver = await Driver.findById(data.driverId);
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }

    const valor = parseFloat((driver.precoKm * data.distanciaKm).toFixed(2));

    const ride = await Ride.create({
      driverId: data.driverId,
      passageiroId: authReq.user._id,
      passageiroNome: authReq.user.nome,
      origem: data.origem,
      destino: data.destino,
      distanciaKm: data.distanciaKm,
      valor,
      data: data.data,
      hora: data.hora,
      status: 'pendente',
    });

    res.status(201).json(ride);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// GET /api/rides/passenger/:userId
export const getRidesByPassenger = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, any> = { passageiroId: req.params.userId };
    if (req.query.status) filter.status = req.query.status;
    const rides = await Ride.find(filter)
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'nome' } })
      .sort({ data: 1, hora: 1 });
    res.json(rides);
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

// PUT /api/rides/:rideId/status
export const updateRideStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = statusSchema.parse(req.body);

    const ride = await Ride.findOneAndUpdate(
      { _id: req.params.rideId },
      { status },
      { new: true }
    );

    if (!ride) { res.status(404).json({ error: 'Corrida não encontrada.' }); return; }
    res.json(ride);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
