import { Schema, model } from 'mongoose';

const notificationSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  tipo: { 
    type: String, 
    enum: ['corrida_cancelada', 'nova_corrida', 'corrida_aceita', 'corrida_concluida'],
    required: true 
  },
  titulo: { 
    type: String, 
    required: true 
  },
  corpo: { 
    type: String, 
    required: true 
  },
  lida: { 
    type: Boolean, 
    default: false 
  },
  rideId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Ride', 
    required: true
  },
  criadoEm: { 
    type: Date, 
    default: Date.now 
  }
});

export default model('Notification', notificationSchema);