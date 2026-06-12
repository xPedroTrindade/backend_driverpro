import { Schema, model } from 'mongoose';

const vehicleSchema = new Schema({
  driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
  modelo: { type: String, required: true },
  placa: { type: String, required: true, unique: true },
  consumoMedio: { type: Number },
  lugares: { type: Number },
  aceitaPets: { type: Boolean, default: false },
  aceitaCadeirinha: { type: Boolean, default: false },
  aceitaVolumes: { type: Boolean, default: false }
}, { timestamps: true });

export default model('Vehicle', vehicleSchema);