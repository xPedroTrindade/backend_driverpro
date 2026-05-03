import { Schema, model } from 'mongoose';

const unavailablePeriodSchema = new Schema({
  driverId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Driver', 
    required: true 
  },
  dataInicio: { 
    type: Date, 
    required: true 
  },
  dataFim: { 
    type: Date, 
    required: true 
  },
  motivo: { 
    type: String, 
    enum: ['manutencao', 'descanso', 'compromisso_pessoal', 'outros'],
    default: 'outros' 
  }
}, { timestamps: true });

export default model('UnavailablePeriod', unavailablePeriodSchema);