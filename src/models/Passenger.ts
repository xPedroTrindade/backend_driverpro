import { Schema, model } from 'mongoose';

const passengerSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true }
}, { timestamps: true });

export default model('Passenger', passengerSchema);
