import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { serialize, parseDate } from '../lib/serialize';
import { isNotFound, isUniqueViolation } from '../lib/errors';
import { hashPassword } from '../services/authService';
import { hojeBrasil, anoMesBrasil } from '../lib/time';

// "Hoje" no fuso de Brasília (o servidor roda em UTC).
const hoje = () => parseDate(hojeBrasil());

// GET /api/drivers — lista todos os motoristas com veículo (para passageiros)
export const listDrivers = async (req: Request, res: Response): Promise<void> => {
  try {
    // Visão pública: sem email do motorista e sem dados financeiros (lucroTotal)
    const drivers = await prisma.driver.findMany({
      omit: { lucroTotal: true },
      include: { user: { select: { id: true, nome: true, avatarUrl: true } }, vehicle: true },
      orderBy: { createdAt: 'asc' },
    });

    // Mesmo formato do populate antigo: userId vira { _id, nome, avatarUrl }
    const result = drivers.map(({ user, vehicle, ...driver }) => ({
      ...serialize(driver),
      userId: serialize(user),
      vehicle: vehicle ? serialize(vehicle) : null, // null explícito: depois do serialize
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
    const driver = await prisma.driver.findUnique({
      where: { id: req.params.driverId as string },
      include: { user: true }, // passwordHash já vem omitido pelo client
    });
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }
    const { user, ...rest } = driver;
    res.json({ ...serialize(rest), userId: serialize(user) });
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

// 3.3 — PUT /api/drivers/:driverId/pricing
export const updatePricing = async (req: Request, res: Response): Promise<void> => {
  try {
    const { precoKm } = pricingSchema.parse(req.body);
    const driver = await prisma.driver.update({ where: { id: req.params.driverId as string }, data: { precoKm } });
    res.json(serialize(driver));
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (isNotFound(err)) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 4.1 — PUT /api/drivers/:driverId/availability
export const toggleAvailability = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.driverId as string;
    const driver = await prisma.driver.findUnique({ where: { id }, select: { disponivel: true } });
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }
    const updated = await prisma.driver.update({
      where: { id },
      data: { disponivel: !driver.disponivel },
      select: { disponivel: true },
    });
    res.json({ disponivel: updated.disponivel });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 4.2 — GET /api/drivers/:driverId/summary
export const getTodaySummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const agg = await prisma.ride.aggregate({
      where: { driverId: req.params.driverId as string, status: 'concluida', data: hoje() },
      _count: true,
      _sum: { valor: true },
    });
    const ganhos = agg._sum.valor?.toNumber() ?? 0;
    res.json({ corridas: agg._count, ganhosEstimados: parseFloat(ganhos.toFixed(2)) });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 4.3 — GET /api/drivers/:driverId/next-ride
// Próxima corrida já combinada (confirmada) ou em andamento, de hoje em diante.
export const getNextRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const ride = await prisma.ride.findFirst({
      where: {
        driverId: req.params.driverId as string,
        status: { in: ['confirmada', 'em_andamento'] },
        data: { gte: hoje() },
      },
      orderBy: [{ data: 'asc' }, { hora: 'asc' }],
    });
    res.json(ride ? serialize(ride) : null);
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 4.4 — GET /api/drivers/:driverId/pending-count
// Pedidos que esperam uma ação do motorista: enviar o orçamento.
export const getPendingCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await prisma.ride.count({
      where: { driverId: req.params.driverId as string, status: 'aguardando_orcamento' },
    });
    res.json({ pendentes: count });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 6.1 — GET /api/drivers/:driverId/schedule?year=&month=
export const getScheduleMonth = async (req: Request, res: Response): Promise<void> => {
  try {
    const driverId = req.params.driverId as string;
    const atual = anoMesBrasil();
    const year = parseInt(req.query.year as string) || atual.ano;
    const month = parseInt(req.query.month as string) || atual.mes;

    const inicio = new Date(Date.UTC(year, month - 1, 1));
    const fim = new Date(Date.UTC(year, month, 0)); // último dia do mês

    const rides = await prisma.ride.groupBy({
      by: ['data'],
      where: { driverId, data: { gte: inicio, lte: fim } },
      _count: { _all: true },
      orderBy: { data: 'asc' },
    });

    const periods = await prisma.unavailablePeriod.findMany({
      where: { driverId, dataInicio: { lte: fim }, dataFim: { gte: inicio } },
      select: { id: true, dataInicio: true, dataFim: true, motivo: true },
    });

    res.json({
      dias: rides.map((r) => ({ dia: r.data.getUTCDate(), totalCorridas: r._count._all })),
      periodosIndisponiveis: serialize(periods),
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

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) { res.status(409).json({ error: 'Este email já está cadastrado.' }); return; }

    // Usuário + perfil de passageiro numa única escrita atômica.
    const user = await prisma.user.create({
      data: {
        nome: data.nome,
        email,
        telefone: data.telefone,
        tipo: 'passageiro',
        passwordHash: await hashPassword(data.senha),
        passenger: { create: { createdByDriverId: req.params.driverId as string } },
      },
    });

    res.status(201).json({ _id: user.id, nome: user.nome, email: user.email, telefone: user.telefone });
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (isUniqueViolation(err, 'email')) { res.status(409).json({ error: 'Este email já está cadastrado.' }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// GET /api/drivers/:driverId/passengers — passageiros do motorista (criados por ele + que já pediram corrida com ele)
export const listDriverPassengers = async (req: Request, res: Response): Promise<void> => {
  try {
    const driverId = req.params.driverId as string;

    const users = await prisma.user.findMany({
      where: {
        tipo: 'passageiro',
        OR: [
          { passenger: { createdByDriverId: driverId } },
          { rides: { some: { driverId } } },
        ],
      },
      select: { id: true, nome: true, email: true, telefone: true },
      orderBy: { nome: 'asc' },
    });

    res.json(serialize(users));
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
