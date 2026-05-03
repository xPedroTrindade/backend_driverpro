import { Schema, model } from 'mongoose';
import Notification from './Notification';
import Driver from './Driver';

const rideSchema = new Schema({
  driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
  passageiroNome: { type: String, required: true },
  origem: { type: String, required: true },
  destino: { type: String, required: true },
  distanciaKm: { type: Number, required: true },
  valor: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pendente', 'em_andamento', 'concluida', 'cancelada'], 
    default: 'pendente' 
  },
  data: { type: String, required: true },
  hora: { type: String, required: true }
}, { timestamps: true });

rideSchema.post('save', async function(doc) {
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

rideSchema.post('findOneAndUpdate', async function(doc) {
  if (!doc) return;

  try {
    const driver = await Driver.findById(doc.driverId);
    if (!driver) return;

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
    }

    if (notificationData.tipo) {
      await Notification.create(notificationData);
    }
  } catch (error) {
    console.error('Erro ao atualizar notificação:', error);
  }
});

export default model('Ride', rideSchema);