import { RegisterInput } from '../validators/authValidator';
import User from '../models/User';
import Driver from '../models/Driver';
import Passenger from '../models/Passenger';

export const registerUser = async (firebaseUid: string, data: RegisterInput) => {
  const existing = await User.findOne({
    $or: [{ email: data.email }, { firebaseUid }]
  });

  if (existing) {
    const conflict = existing.email === data.email ? 'email' : 'conta Firebase';
    throw { status: 409, message: `Este ${conflict} já está cadastrado.` };
  }

  const user = await User.create({
    firebaseUid,
    nome: data.nome,
    email: data.email,
    telefone: data.telefone,
    tipo: data.tipo
  });

  if (data.tipo === 'motorista') {
    await Driver.create({ userId: user._id, precoKm: data.precoKm! });
  } else {
    await Passenger.create({ userId: user._id });
  }

  return {
    _id: user._id,
    nome: user.nome,
    email: user.email,
    tipo: user.tipo,
    createdAt: user.createdAt
  };
};
