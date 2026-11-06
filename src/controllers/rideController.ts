import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth';
import Ride from '../models/Ride';
import Driver from '../models/Driver';
import User from '../models/User';
import { notifyUser } from '../services/notify';
import { sendMail } from '../services/mailer';

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
  custoCombustivel: z.number().nonnegative().optional(),
  custoTotal: z.number().nonnegative().optional(),
  lucroLiquido: z.number().optional(),
  data: z.string().date('Data inválida. Use YYYY-MM-DD.'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida. Use HH:MM.'),
});

const statusSchema = z.object({
  status: z.enum(['em_andamento', 'concluida', 'cancelada']),
});

type Papel = 'motorista' | 'passageiro';
type StatusAlvo = z.infer<typeof statusSchema>['status'];

// Máquina de estados: status atual -> status de destino -> quem pode fazer a transição.
// O papel vem da relação com a corrida (dono do driverId ou passageiroId), não do user.tipo.
// 'pendente' é o fluxo legado (corrida manual); 'confirmada' é o fluxo de orçamento.
const TRANSICOES: Record<string, Partial<Record<StatusAlvo, Papel[]>>> = {
  aguardando_orcamento:   { cancelada: ['motorista', 'passageiro'] },
  aguardando_confirmacao: { cancelada: ['motorista', 'passageiro'] },
  confirmada:             { em_andamento: ['motorista'], cancelada: ['motorista', 'passageiro'] },
  pendente:               { em_andamento: ['motorista'], cancelada: ['motorista', 'passageiro'] },
  em_andamento:           { concluida: ['motorista'], cancelada: ['motorista', 'passageiro'] },
  concluida:              {},
  cancelada:              {},
};

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

    // Novo fluxo: o passageiro solicita SEM preço. O motorista envia o orçamento depois.
    const ride = await Ride.create({
      driverId: data.driverId,
      passageiroId: authReq.user._id,
      passageiroNome: authReq.user.nome,
      origem: data.origem,
      destino: data.destino,
      distanciaKm: data.distanciaKm,
      valor: 0,
      data: data.data,
      hora: data.hora,
      status: 'aguardando_orcamento',
    });

    // A notificação in-app do motorista é criada pelo hook post-save do Ride.
    // Aqui disparamos o e-mail (stub — SMTP pendente).
    const driverUser = await User.findById(driver.userId).select('email');
    if (driverUser?.email) {
      await sendMail({
        to: driverUser.email,
        subject: 'Novo pedido de corrida',
        text: `${authReq.user.nome} solicitou uma corrida de ${data.origem} para ${data.destino}. Faça o orçamento no app.`,
      });
    }

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
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user._id.toString();

    const ride = await Ride.findById(req.params.rideId);
    if (!ride) { res.status(404).json({ error: 'Corrida não encontrada.' }); return; }

    // Descobre o papel do usuário NESTA corrida
    const driver = await Driver.findById(ride.driverId).select('userId');
    let papel: Papel | null = null;
    if (driver && driver.userId.toString() === userId) papel = 'motorista';
    else if (ride.passageiroId && ride.passageiroId.toString() === userId) papel = 'passageiro';

    if (!papel) { res.status(403).json({ error: 'Acesso negado.' }); return; }

    const permitidos = TRANSICOES[ride.status]?.[status];
    if (!permitidos) {
      res.status(409).json({ error: `Não é possível mudar a corrida de "${ride.status}" para "${status}".` }); return;
    }
    if (!permitidos.includes(papel)) {
      res.status(403).json({ error: `Apenas o ${permitidos.join(' ou ')} pode fazer esta alteração.` }); return;
    }

    // Update condicional ao status lido: se outra requisição mudou a corrida no meio
    // do caminho (ex.: dois "concluir" simultâneos), nada é alterado e o lucro não é somado 2x.
    const updated = await Ride.findOneAndUpdate(
      { _id: ride._id, status: ride.status },
      { status },
      { new: true }
    );

    if (!updated) {
      res.status(409).json({ error: 'A corrida foi alterada por outra ação. Atualize e tente novamente.' }); return;
    }
    res.json(updated);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    if (err.name === 'CastError') { res.status(400).json({ error: 'ID inválido.' }); return; }
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

    const ride = await Ride.findById(req.params.rideId);
    if (!ride) { res.status(404).json({ error: 'Corrida não encontrada.' }); return; }

    // Confere se a corrida pertence ao motorista logado
    const driver = await Driver.findById(ride.driverId);
    if (!driver || driver.userId.toString() !== authReq.user._id.toString()) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }
    if (ride.status !== 'aguardando_orcamento') {
      res.status(409).json({ error: 'Esta corrida não está aguardando orçamento.' }); return;
    }

    const updated = await Ride.findByIdAndUpdate(
      ride._id,
      { valor, status: 'aguardando_confirmacao' },
      { new: true }
    );

    // Notifica o passageiro (in-app + e-mail stub)
    if (ride.passageiroId) {
      await notifyUser(ride.passageiroId, {
        tipo: 'orcamento_recebido',
        titulo: 'Orçamento recebido',
        corpo: `O motorista orçou R$ ${valor.toFixed(2)} para sua corrida de ${ride.origem} até ${ride.destino}.`,
        rideId: ride._id,
      });
    }

    res.json(updated);
  } catch (err: any) {
    if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// PUT /api/rides/:rideId/confirm — passageiro confirma o orçamento
export const confirmRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;

    const ride = await Ride.findById(req.params.rideId);
    if (!ride) { res.status(404).json({ error: 'Corrida não encontrada.' }); return; }

    // Confere se a corrida pertence ao passageiro logado
    if (!ride.passageiroId || ride.passageiroId.toString() !== authReq.user._id.toString()) {
      res.status(403).json({ error: 'Acesso negado.' }); return;
    }
    if (ride.status !== 'aguardando_confirmacao') {
      res.status(409).json({ error: 'Esta corrida não está aguardando confirmação.' }); return;
    }

    const updated = await Ride.findByIdAndUpdate(
      ride._id,
      { status: 'confirmada' },
      { new: true }
    );

    // Notifica o motorista (in-app + e-mail stub)
    const driver = await Driver.findById(ride.driverId);
    if (driver) {
      await notifyUser(driver.userId, {
        tipo: 'corrida_confirmada',
        titulo: 'Corrida confirmada!',
        corpo: `${ride.passageiroNome} confirmou a corrida de ${ride.origem} até ${ride.destino} por R$ ${(ride.valor ?? 0).toFixed(2)}.`,
        rideId: ride._id,
      });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
