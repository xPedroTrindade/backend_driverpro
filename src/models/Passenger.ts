import { Schema, model } from 'mongoose';

const passengerSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // Motorista que cadastrou este passageiro (null se o passageiro se cadastrou sozinho)
  createdByDriver: { type: Schema.Types.ObjectId, ref: 'Driver', default: null }
}, { timestamps: true });

export default model('Passenger', passengerSchema);
