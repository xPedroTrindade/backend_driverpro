import { Request, Response } from 'express';
import { z } from 'zod';
import { RideStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { serialize, parseDate, parseTime } from '../lib/serialize';
import { isInvalidId, isExclusionViolation } from '../lib/errors';
import * as rideService from '../services/rideService';
import type { Papel } from '../services/rideService';
import { calcularFinanceiro } from '../services/rideFinance';
import { sendMail } from '../services/mailer';

// HH:MM com hora e minuto válidos (o banco guarda TIME de verdade).
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida. Use HH:MM.');

const requestRideSchema = z.object({
  driverId: z.string().min(1),
  origem: z.string().min(2).trim(),
  destino: z.string().min(2).trim(),
  distanciaKm: z.number().positive(),
  data: z.string().date('Data inválida. Use YYYY-MM-DD.'),
  hora,
});

const createRideSchema = z.object({
  driverId: z.string().min(1),
  passageiroId: z.string().optional(),
  passageiroNome: z.string().min(2).trim(),
  origem: z.string().min(2).trim(),
  destino: z.string().min(2).trim(),
  distanciaKm: z.number().positive(),
  valor: z.number().positive(),
  idaVolta: z.boolean().optional(),
  taxaEspera: z.number().nonnegative().optional(),
  pedagio: z.number().nonnegative().optional(),
  consumoMedio: z.number().positive().optional(),
  combustivelPreco: z.number().nonnegative().optional(),
  precoKm: z.number().nonnegative().optional(),
  // custoCombustivel, custoTotal e lucroLiquido NÃO são aceitos do app:
  // o servidor calcula (rideFinance). Se vierem no corpo, o Zod descarta.
  data: z.string().date('Data inválida. Use YYYY-MM-DD.'),
  hora,
});

const statusSchema = z.object({
  status: z.enum(['em_andamento', 'concluida', 'cancelada']),
});

type StatusAlvo = z.infer<typeof statusSchema>['status'];

// Máquina de estados: status atual -> status de destino -> quem pode fazer a transição.
// O papel vem da relação com a corrida (dono do driverId ou passageiroId), não do user.tipo.
// Orçamento e confirmação têm rotas próprias (/quote e /confirm).
const TRANSICOES: Record<RideStatus, Partial<Record<StatusAlvo, Papel[]>>> = {
  aguardando_orcamento:   { cancelada: ['motorista', 'passageiro'] },
  aguardando_confirmacao: { cancelada: ['motorista', 'passageiro'] },
  confirmada:             { em_andamento: ['motorista'], cancelada: ['motorista', 'passageiro'] },
  em_andamento:           { concluida: ['motorista'], cancelada: ['motorista', 'passageiro'] },
  concluida:              {},
  cancelada:              {},
};

const ORDEM_AGENDA = [{ data: 'asc' as const }, { hora: 'asc' as const }];

const HORARIO_OCUPADO = 'O motorista já tem uma corrida neste dia e horário.';

// 5.1 — POST /api/rides
export const createRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, hora, ...rest } = createRideSchema.parse(req.body);

    const driver = await prisma.driver.findUnique({
      where: { id: rest.driverId },
      select: { userId: true, vehicle: { select: { consumoMedio: true } } },
    });
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }

    const authReq = req as AuthenticatedRequest;
    if (driver.userId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    // Consumo: o informado na corrida ou, se não vier, o do veículo do motorista.
    const consumoMedio = rest.consumoMedio ?? driver.vehicle?.consumoMedio ?? undefined;

    // Corrida manual: o motorista já combinou com o cliente, então nasce confirmada.
    const ride = await rideService.createRide({
      ...rest,
      consumoMedio,
      ...calcularFinanceiro({ ...rest, consumoMedio }),
      data: parseDate(data),
      hora: parseTime(hora),
      status: 'confirmada',
    }, driver.userId);
    res.status(201).json(serialize(ride));
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (isExclusionViolation(err)) { res.status(409).json({ error: HORARIO_OCUPADO }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// 5.4 — GET /api/rides/driver/:driverId?date=YYYY-MM-DD
export const getRidesByDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const rides = await prisma.ride.findMany({
      where: {
        driverId: req.params.driverId as string,
        ...(req.query.date ? { data: parseDate(String(req.query.date)) } : {}),
      },
      orderBy: ORDEM_AGENDA,
    });
    res.json(serialize(rides));
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

// POST /api/rides/request — passageiro cria agendamento
export const requestRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = requestRideSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;

    const driver = await prisma.driver.findUnique({
      where: { id: data.driverId },
      select: { userId: true, user: { select: { email: true } } },
    });
    if (!driver) { res.status(404).json({ error: 'Motorista não encontrado.' }); return; }

    // Conflito de agenda (1): a data cai numa folga do motorista.
    const dia = parseDate(data.data);
    const folga = await prisma.unavailablePeriod.findFirst({
      where: { driverId: data.driverId, dataInicio: { lte: dia }, dataFim: { gte: dia } },
      select: { id: true },
    });
    if (folga) { res.status(409).json({ error: 'O motorista está indisponível nesta data.' }); return; }

    // O passageiro solicita SEM preço. O motorista envia o orçamento depois.
    // A notificação in-app do motorista nasce na mesma transação (rideService).
    // Conflito de agenda (2): mesmo dia e hora de outra corrida ativa -> EXCLUDE do banco.
    const ride = await rideService.createRide({
      driverId: data.driverId,
      passageiroId: authReq.user.id,
      passageiroNome: authReq.user.nome,
      origem: data.origem,
      destino: data.destino,
      distanciaKm: data.distanciaKm,
      valor: 0,
      data: dia,
      hora: parseTime(data.hora),
      status: 'aguardando_orcamento',
    }, driver.userId);

    // E-mail ao motorista (stub — SMTP pendente).
    if (driver.user.email) {
      await sendMail({
        to: driver.user.email,
        subject: 'Novo pedido de corrida',
        text: `${authReq.user.nome} solicitou uma corrida de ${data.origem} para ${data.destino}. Faça o orçamento no app.`,
      });
    }

    res.status(201).json(serialize(ride));
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (isExclusionViolation(err)) { res.status(409).json({ error: HORARIO_OCUPADO }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// GET /api/rides/passenger/:userId
export const getRidesByPassenger = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (req.params.userId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }

    // Status desconhecido não casa com nada (como no Mongo), em vez de erro.
    const status = req.query.status as string | undefined;
    if (status && !(status in RideStatus)) { res.json([]); return; }

    const rides = await prisma.ride.findMany({
      where: { passageiroId: authReq.user.id, ...(status ? { status: status as RideStatus } : {}) },
      // Só o necessário do motorista — sem lucroTotal/totalCorridas
      include: {
        driver: {
          select: { id: true, precoKm: true, user: { select: { id: true, nome: true, avatarUrl: true } } },
        },
      },
      orderBy: ORDEM_AGENDA,
    });

    // Mesmo formato do populate antigo: driverId vira { _id, userId: { _id, nome, avatarUrl }, precoKm }
    res.json(rides.map(({ driver, ...ride }) => ({
      ...serialize(ride),
      driverId: serialize({ id: driver.id, userId: driver.user, precoKm: driver.precoKm }),
    })));
  } catch {
    res.status(400).json({ error: 'ID inválido.' });
  }
};

// Descobre o papel do usuário NESTA corrida (motorista dono ou passageiro da corrida).
async function papelNaCorrida(ride: { driverId: string; passageiroId: string | null }, userId: string) {
  const driver = await prisma.driver.findUnique({ where: { id: ride.driverId }, select: { userId: true } });
  if (driver?.userId === userId) return { papel: 'motorista' as Papel, driverUserId: driver.userId };
  if (ride.passageiroId === userId) return { papel: 'passageiro' as Papel, driverUserId: driver!.userId };
  return null;
}

// PUT /api/rides/:rideId/status
export const updateRideStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = statusSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;

    const ride = await prisma.ride.findUnique({ where: { id: req.params.rideId as string } });
    if (!ride) { res.status(404).json({ error: 'Corrida não encontrada.' }); return; }

    const quem = await papelNaCorrida(ride, authReq.user.id);
    if (!quem) { res.status(403).json({ error: 'Acesso negado.' }); return; }

    const permitidos = TRANSICOES[ride.status]?.[status];
    if (!permitidos) {
      res.status(409).json({ error: `Não é possível mudar a corrida de "${ride.status}" para "${status}".` }); return;
    }
    if (!permitidos.includes(quem.papel)) {
      res.status(403).json({ error: `Apenas o ${permitidos.join(' ou ')} pode fazer esta alteração.` }); return;
    }

    // Transação com update condicional ao status lido (ver rideService).
    const updated = await rideService.changeRideStatus(ride.id, ride.status, status, quem.driverUserId, quem.papel);

    if (!updated) {
      res.status(409).json({ error: 'A corrida foi alterada por outra ação. Atualize e tente novamente.' }); return;
    }
    res.json(serialize(updated));
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (isInvalidId(err)) { res.status(400).json({ error: 'ID inválido.' }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// PUT /api/rides/:rideId/quote — motorista envia o orçamento (preço) da corrida
const quoteSchema = z.object({
  valor: z.number().positive('Informe um valor maior que zero.').max(100000, 'Valor muito alto.'),
});

export const quoteRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const { valor } = quoteSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;

    const ride = await prisma.ride.findUnique({ where: { id: req.params.rideId as string } });
    if (!ride) { res.status(404).json({ error: 'Corrida não encontrada.' }); return; }

    // Confere se a corrida pertence ao motorista logado
    const driver = await prisma.driver.findUnique({ where: { id: ride.driverId }, select: { userId: true } });
    if (!driver || driver.userId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }
    if (ride.status !== 'aguardando_orcamento') {
      res.status(409).json({ error: 'Esta corrida não está aguardando orçamento.' }); return;
    }

    const updated = await rideService.quoteRide(ride, valor);
    if (!updated) { res.status(409).json({ error: 'Esta corrida não está aguardando orçamento.' }); return; }

    res.json(serialize(updated));
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// PUT /api/rides/:rideId/confirm — passageiro confirma o orçamento
export const confirmRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;

    const ride = await prisma.ride.findUnique({
      where: { id: req.params.rideId as string },
      include: { driver: { select: { userId: true } } },
    });
    if (!ride) { res.status(404).json({ error: 'Corrida não encontrada.' }); return; }

    // Confere se a corrida pertence ao passageiro logado
    if (!ride.passageiroId || ride.passageiroId !== authReq.user.id) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }
    if (ride.status !== 'aguardando_confirmacao') {
      res.status(409).json({ error: 'Esta corrida não está aguardando confirmação.' }); return;
    }

    const { driver, ...rideRow } = ride;
    const updated = await rideService.confirmRide(rideRow, driver.userId);
    if (!updated) { res.status(409).json({ error: 'Esta corrida não está aguardando confirmação.' }); return; }

    res.json(serialize(updated));
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
