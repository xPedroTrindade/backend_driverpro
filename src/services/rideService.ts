// =============================================================================
// services/rideService.ts — Escritas em corridas, cada uma numa transação.
// -----------------------------------------------------------------------------
// Substitui os hooks do antigo src/models/Ride.ts (Mongoose):
//   post('save')             -> createRide        (notifica o motorista)
//   post('findOneAndUpdate') -> changeRideStatus  (notifica + soma lucro)
// e também o orçamento/confirmação.
//
// Fluxo único de status:
//   pedido do passageiro: aguardando_orcamento -> aguardando_confirmacao -> confirmada
//   corrida manual do motorista: já nasce confirmada
//   confirmada -> em_andamento -> concluida   (cancelada a qualquer momento antes do fim)
//
// Conflito de agenda: a EXCLUDE "rides_sem_conflito_de_horario" impede duas
// corridas ativas do mesmo motorista no mesmo dia e hora (erro 23P01 -> 409).
//
// Toda mudança de status é um UPDATE condicional ao status lido
// (WHERE id = ? AND status = ?). Se outra requisição mudou a corrida no meio
// do caminho, nada é alterado e a função devolve null (o controller responde
// 409). No Postgres o segundo UPDATE espera o lock da linha e, ao reavaliar o
// WHERE, já não casa — por isso o lucro nunca é somado duas vezes.
// =============================================================================
import { Prisma, RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createNotification, emailUser, NotifyInput } from './notify';
import { calcularFinanceiro } from './rideFinance';

type Ride = Prisma.RideGetPayload<{}>;
export type StatusAlvo = Extract<RideStatus, 'em_andamento' | 'concluida' | 'cancelada'>;

const reais = (v: Prisma.Decimal | number) => Number(v).toFixed(2);

// Corrida nova (pedido do passageiro ou manual do motorista) + aviso ao motorista.
export function createRide(data: Prisma.RideUncheckedCreateInput, driverUserId: string) {
  return prisma.$transaction(async (tx) => {
    const ride = await tx.ride.create({ data });
    await createNotification(tx, driverUserId, {
      tipo: 'nova_corrida',
      titulo: 'Novo Pedido de Corrida!',
      corpo: `Você tem um novo pedido de ${ride.passageiroNome}.`,
      rideId: ride.id,
    });
    return ride;
  });
}

export type Papel = 'motorista' | 'passageiro';
type Aviso = Omit<NotifyInput, 'rideId'>;

// Avisos ao MOTORISTA por mudança de status.
const AVISO_MOTORISTA: Record<StatusAlvo, (r: Ride, lucro: Prisma.Decimal) => Aviso> = {
  cancelada: (r) => ({
    tipo: 'corrida_cancelada',
    titulo: 'Corrida Cancelada',
    corpo: `A corrida de ${r.passageiroNome} foi cancelada.`,
  }),
  em_andamento: (r) => ({
    tipo: 'corrida_aceita',
    titulo: 'Corrida Confirmada',
    corpo: `Tudo pronto! Inicie o trajeto para ${r.destino}.`,
  }),
  concluida: (r, lucro) => ({
    tipo: 'corrida_concluida',
    titulo: 'Corrida Concluída',
    corpo: `Corrida de ${r.passageiroNome} concluída. +R$ ${reais(lucro)} no seu lucro.`,
  }),
};

// Avisos ao PASSAGEIRO por mudança de status (reusam os tipos que o app já conhece).
const AVISO_PASSAGEIRO: Record<StatusAlvo, (r: Ride) => Aviso> = {
  cancelada: (r) => ({
    tipo: 'corrida_cancelada',
    titulo: 'Corrida cancelada',
    corpo: `O motorista cancelou sua corrida de ${r.origem} até ${r.destino}.`,
  }),
  em_andamento: (r) => ({
    tipo: 'corrida_aceita',
    titulo: 'Motorista a caminho',
    corpo: `Seu motorista iniciou a corrida até ${r.destino}.`,
  }),
  concluida: (r) => ({
    tipo: 'corrida_concluida',
    titulo: 'Corrida concluída',
    corpo: `Sua corrida até ${r.destino} foi concluída. Obrigado por viajar com o DriverPro!`,
  }),
};

// Muda o status (from -> to) feito por `quem`. Ao concluir, soma lucro e
// totalCorridas do motorista na MESMA transação. Retorna null se a corrida não
// estava mais em `from`.
//
// Quem é avisado:
//   cancelar  -> só a OUTRA parte (quem cancelou já sabe)
//   iniciar / concluir (sempre o motorista) -> motorista e passageiro
// Corrida manual (sem passageiroId) só avisa o motorista.
export async function changeRideStatus(
  rideId: string, from: RideStatus, to: StatusAlvo, driverUserId: string, quem: Papel,
) {
  const emails: { userId: string; titulo: string; corpo: string }[] = [];

  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.ride.updateMany({ where: { id: rideId, status: from }, data: { status: to } });
    if (count === 0) return null;

    const ride = await tx.ride.findUniqueOrThrow({ where: { id: rideId } });
    const lucro = ride.lucroLiquido ?? ride.valor;

    if (to === 'concluida') {
      await tx.driver.update({
        where: { id: ride.driverId },
        data: { lucroTotal: { increment: lucro }, totalCorridas: { increment: 1 } },
      });
    }

    const avisarMotorista = !(to === 'cancelada' && quem === 'motorista');
    const avisarPassageiro = ride.passageiroId && !(to === 'cancelada' && quem === 'passageiro');

    if (avisarMotorista) {
      await createNotification(tx, driverUserId, { ...AVISO_MOTORISTA[to](ride, lucro), rideId });
    }
    if (avisarPassageiro) {
      const n = await createNotification(tx, ride.passageiroId!, { ...AVISO_PASSAGEIRO[to](ride), rideId });
      emails.push(n);
    }
    return ride;
  });

  // E-mail ao passageiro só depois do commit (best-effort).
  for (const e of emails) await emailUser(e.userId, e.titulo, e.corpo);
  return updated;
}

// Motorista envia o orçamento: aguardando_orcamento -> aguardando_confirmacao.
// Avisa o passageiro (in-app na transação; e-mail depois do commit).
export async function quoteRide(ride: Ride, valor: number) {
  let aviso: { userId: string; titulo: string; corpo: string } | undefined;

  const updated = await prisma.$transaction(async (tx) => {
    // Com o preço definido, o lucro é recalculado no servidor.
    const { count } = await tx.ride.updateMany({
      where: { id: ride.id, status: 'aguardando_orcamento' },
      data: { valor, status: 'aguardando_confirmacao', ...calcularFinanceiro({ ...ride, valor }) },
    });
    if (count === 0) return null;

    if (ride.passageiroId) {
      aviso = await createNotification(tx, ride.passageiroId, {
        tipo: 'orcamento_recebido',
        titulo: 'Orçamento recebido',
        corpo: `O motorista orçou R$ ${reais(valor)} para sua corrida de ${ride.origem} até ${ride.destino}.`,
        rideId: ride.id,
      });
    }
    return tx.ride.findUniqueOrThrow({ where: { id: ride.id } });
  });

  if (aviso) await emailUser(aviso.userId, aviso.titulo, aviso.corpo);
  return updated;
}

// Passageiro confirma o orçamento: aguardando_confirmacao -> confirmada.
// Avisa o motorista (in-app na transação; e-mail depois do commit).
export async function confirmRide(ride: Ride, driverUserId: string) {
  let aviso: { userId: string; titulo: string; corpo: string } | undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.ride.updateMany({
      where: { id: ride.id, status: 'aguardando_confirmacao' },
      data: { status: 'confirmada' },
    });
    if (count === 0) return null;

    aviso = await createNotification(tx, driverUserId, {
      tipo: 'corrida_confirmada',
      titulo: 'Corrida confirmada!',
      corpo: `${ride.passageiroNome} confirmou a corrida de ${ride.origem} até ${ride.destino} por R$ ${reais(ride.valor)}.`,
      rideId: ride.id,
    });
    return tx.ride.findUniqueOrThrow({ where: { id: ride.id } });
  });

  if (aviso) await emailUser(aviso.userId, aviso.titulo, aviso.corpo);
  return updated;
}
