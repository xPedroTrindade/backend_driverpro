import { Schema, model } from 'mongoose';

const vehicleSchema = new Schema({
  driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
  modelo: { type: String, required: true },
  placa: { type: String, required: true, unique: true },
  consumoMedio: { type: Number }
});

export default model('Vehicle', vehicleSchema);