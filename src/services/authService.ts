import mongoose from 'mongoose';
import { RegisterInput } from '../validators/authValidator';
import User from '../models/User';
import Driver from '../models/Driver';
import Passenger from '../models/Passenger';

export const registerUser = async (firebaseUid: string, data: RegisterInput) => {
  // Verifica duplicata antes de abrir a transação (evita lock desnecessário)
  const existing = await User.findOne({
    $or: [{ email: data.email }, { firebaseUid }]
  });

  if (existing) {
    const conflict = existing.email === data.email ? 'email' : 'conta Firebase';
    throw { status: 409, message: `Este ${conflict} já está cadastrado.` };
  }

  // Transação: garante que User + Driver/Passenger são criados juntos.
  // Se qualquer operação falhar, tudo é revertido (equivalente ao ROLLBACK).
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [user] = await User.create(
      [{
        firebaseUid,
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        tipo: data.tipo
      }],
      { session }
    );

    if (data.tipo === 'motorista') {
      await Driver.create([{ userId: user._id, precoKm: data.precoKm! }], { session });
    } else {
      await Passenger.create([{ userId: user._id }], { session });
    }

    await session.commitTransaction();

    return {
      _id: user._id,
      nome: user.nome,
      email: user.email,
      tipo: user.tipo,
      createdAt: user.createdAt
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
