import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import Driver from '../models/Driver';
import Ride from '../models/Ride';
import User from '../models/User';
import Passenger from '../models/Passenger';
import UnavailablePeriod from '../models/UnavailablePeriod';
import Vehicle from '../models/Vehicle';

// GET /api/drivers — lista todos os motoristas com veículo (para passageiros)
export const listDrivers = async (req: Request, res: Response): Promise<void> => {
  try {
    const drivers = await Driver.find().populate('userId', 'nome email avatarUrl');
    const driverIds = drivers.map(d => d._id);
    const vehicles = await Vehicle.find({ driverId: { $in: driverIds } });
    const vehicleMap = new Map(vehicles.map(v => [v.driverId.toString(), v]));

    const result = drivers.map(d => ({
      ...d.toObject(),
      vehicle: vehicleMap.get(d._id.toString()) ?? null,
    }));

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

const pricingSchema = z.object({
  precoKm: z.number().positive('Preço deve ser maior que zero.').max(50, 'Preço máximo: R$ 50/km.'),
});

// 3.1 — GET /api/drivers/:driverId
export const getDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = await Driver.findById(req.params.driverId).populate('userId', '-passwordHash');
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }
    res.json(driver);
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

// 3.3 — PUT /api/drivers/:driverId/pricing
export const updatePricing = async (req: Request, res: Response): Promise<void> => {
  try {
    const { precoKm } = pricingSchema.parse(req.body);
    const driver = await Driver.findByIdAndUpdate(req.params.driverId, { precoKm }, { new: true });
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }
    res.json(driver);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 4.1 — PUT /api/drivers/:driverId/availability
export const toggleAvailability = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = await Driver.findById(req.params.driverId);
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }
    driver.disponivel = !driver.disponivel;
    await driver.save();
    res.json({ disponivel: driver.disponivel });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 4.2 — GET /api/drivers/:driverId/summary
export const getTodaySummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const rides = await Ride.find({ driverId: req.params.driverId, status: 'concluida', data: today });
    const ganhos = rides.reduce((sum, r) => sum + r.valor, 0);
    res.json({ corridas: rides.length, ganhosEstimados: parseFloat(ganhos.toFixed(2)) });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 4.3 — GET /api/drivers/:driverId/next-ride
export const getNextRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const ride = await Ride.findOne({
      driverId: req.params.driverId,
      status: { $in: ['pendente', 'em_andamento'] },
      data: { $gte: today },
    }).sort({ data: 1, hora: 1 });
    res.json(ride ?? null);
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 4.4 — GET /api/drivers/:driverId/pending-count
export const getPendingCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await Ride.countDocuments({ driverId: req.params.driverId, status: 'pendente' });
    res.json({ pendentes: count });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 6.1 — GET /api/drivers/:driverId/schedule?year=&month=
export const getScheduleMonth = async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    const prefix = `${year}-${String(month).padStart(2, '0')}`;

    const rides = await Ride.find({
      driverId: req.params.driverId,
      data: { $regex: `^${prefix}` },
    }).select('data status');

    // Agrupa por dia
    const byDay: Record<number, number> = {};
    for (const r of rides) {
      const day = parseInt(r.data.split('-')[2]);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    const periods = await UnavailablePeriod.find({
      driverId: req.params.driverId,
      dataInicio: { $lte: new Date(`${prefix}-31`) },
      dataFim: { $gte: new Date(`${prefix}-01`) },
    }).select('dataInicio dataFim motivo');

    res.json({
      dias: Object.entries(byDay).map(([dia, totalCorridas]) => ({
        dia: parseInt(dia),
        totalCorridas,
      })),
      periodosIndisponiveis: periods,
    });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

const createPassengerSchema = z.object({
  nome: z.string().min(2, 'Nome muito curto.').trim(),
  email: z.string().email('Email inválido.'),
  telefone: z.string().min(10, 'Telefone inválido.').max(15, 'Telefone inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
});

// POST /api/drivers/:driverId/passengers — motorista cadastra um passageiro (conta REAL que pode logar)
export const registerPassenger = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createPassengerSchema.parse(req.body);
    const email = data.email.toLowerCase().trim();

    const existing = await User.findOne({ email });
    if (existing) { res.status(409).json({ error: 'Este email já está cadastrado.' }); return; }

    const user = await User.create({
      firebaseUid: randomUUID(),
      nome: data.nome,
      email,
      telefone: data.telefone,
      tipo: 'passageiro',
      passwordHash: data.senha,
    });

    await Passenger.create({ userId: user._id, createdByDriver: req.params.driverId } as any);

    res.status(201).json({ _id: user._id, nome: user.nome, email: user.email, telefone: user.telefone });
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// GET /api/drivers/:driverId/passengers — passageiros do motorista (criados por ele + que já pediram corrida com ele)
export const listDriverPassengers = async (req: Request, res: Response): Promise<void> => {
  try {
    const driverId = req.params.driverId;

    const created = await Passenger.find({ createdByDriver: driverId }).select('userId');
    const createdIds = created.map(p => p.userId?.toString()).filter(Boolean) as string[];

    const rideIds = (await Ride.distinct('passageiroId', { driverId, passageiroId: { $ne: null } }))
      .map((id: any) => id.toString());

    const allIds = [...new Set([...createdIds, ...rideIds])];

    const users = await User.find({ _id: { $in: allIds }, tipo: 'passageiro' })
      .select('nome email telefone')
      .sort({ nome: 1 });

    res.json(users);
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
