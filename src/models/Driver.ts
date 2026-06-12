import { Schema, model } from 'mongoose';

const driverSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  precoKm: { type: Number, default: 0 },
  contaVerificada: { type: Boolean, default: false },
  disponivel: { type: Boolean, default: true },
  totalCorridas: { type: Number, default: 0 },
  lucroTotal: { type: Number, default: 0 }
}, { timestamps: true });

export default model('Driver', driverSchema);