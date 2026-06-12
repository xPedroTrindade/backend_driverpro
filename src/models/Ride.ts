import { Schema, model } from 'mongoose';
import Notification from './Notification';
import Driver from './Driver';

const rideSchema = new Schema({
  driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
  passageiroId: { type: Schema.Types.ObjectId, ref: 'User' },
  passageiroNome: { type: String, required: true },
  origem: { type: String, required: true },
  destino: { type: String, required: true },
  distanciaKm: { type: Number, required: true },
  valor: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['aguardando_orcamento', 'aguardando_confirmacao', 'confirmada', 'pendente', 'em_andamento', 'concluida', 'cancelada'],
    default: 'aguardando_orcamento'
  },
  data: { type: String, required: true },
  hora: { type: String, required: true }
}, { timestamps: true });

// Notificação ao criar nova corrida
rideSchema.post('save', async function (doc) {
  try {
    const driver = await Driver.findById(doc.driverId);

    if (driver) {
      await Notification.create({
        userId: driver.userId,
        tipo: 'nova_corrida',
        titulo: 'Novo Pedido de Corrida!',
        corpo: `Você tem um novo pedido de ${doc.passageiroNome}.`,
        rideId: doc._id,
        lida: false
      });
    }
  } catch (error) {
    console.error('Erro ao gerar notificação de nova corrida:', error);
  }
});

// Notificação + atualização de lucro ao mudar status da corrida.
// Requer { new: true } no findOneAndUpdate para receber o doc atualizado.
rideSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) return;

  try {
    const driver = await Driver.findById(doc.driverId);
    if (!driver) return;

    // Atualiza estatísticas do motorista ao concluir corrida
    if (doc.status === 'concluida') {
      await Driver.findByIdAndUpdate(doc.driverId, {
        $inc: {
          lucroTotal: doc.valor,
          totalCorridas: 1
        }
      });
    }

    // Notificações de mudança de status
    let notificationData = {
      userId: driver.userId,
      rideId: doc._id,
      lida: false,
      tipo: '' as any,
      titulo: '',
      corpo: ''
    };

    if (doc.status === 'cancelada') {
      notificationData.tipo = 'corrida_cancelada';
      notificationData.titulo = 'Corrida Cancelada';
      notificationData.corpo = `A corrida de ${doc.passageiroNome} foi cancelada.`;
    } else if (doc.status === 'em_andamento') {
      notificationData.tipo = 'corrida_aceita';
      notificationData.titulo = 'Corrida Confirmada';
      notificationData.corpo = `Tudo pronto! Inicie o trajeto para ${doc.destino}.`;
    } else if (doc.status === 'concluida') {
      notificationData.tipo = 'corrida_concluida';
      notificationData.titulo = 'Corrida Concluída';
      notificationData.corpo = `Corrida de ${doc.passageiroNome} concluída. +R$ ${doc.valor.toFixed(2)} no seu lucro.`;
    }

    if (notificationData.tipo) {
      await Notification.create(notificationData);
    }
  } catch (error) {
    console.error('Erro ao processar hook de corrida:', error);
  }
});

export default model('Ride', rideSchema);
