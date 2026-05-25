import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { RegisterInput } from '../validators/authValidator';
import User from '../models/User';
import Driver from '../models/Driver';
import Passenger from '../models/Passenger';

async function getDriverInfo(userId: mongoose.Types.ObjectId) {
  const driver = await Driver.findOne({ userId }).select('_id precoKm disponivel');
  return driver ? { driverId: driver._id.toString(), precoKm: driver.precoKm, disponivel: driver.disponivel } : null;
}

const JWT_EXPIRES_IN = '7d';

function signToken(id: unknown, tipo: string) {
  return jwt.sign({ id, tipo }, process.env.JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
}

export const registerUser = async (data: RegisterInput) => {
  const existing = await User.findOne({ email: data.email });
  if (existing) {
    throw { status: 409, message: 'Este email já está cadastrado.' };
  }

  const user = await User.create({
    firebaseUid: randomUUID(),
    nome: data.nome,
    email: data.email,
    telefone: data.telefone,
    tipo: data.tipo,
    passwordHash: data.senha,
  });

  if (data.tipo === 'motorista') {
    await Driver.create({ userId: user._id, precoKm: data.precoKm! });
  } else {
    await Passenger.create({ userId: user._id });
  }

  const driverInfo = data.tipo === 'motorista' ? await getDriverInfo(user._id) : null;

  return {
    token: signToken(user._id, user.tipo),
    user: { _id: user._id, nome: user.nome, email: user.email, tipo: user.tipo },
    ...(driverInfo && { driverId: driverInfo.driverId, driver: driverInfo }),
  };
};

export const loginUser = async (email: string, senha: string) => {
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user || !user.passwordHash) {
    throw { status: 401, message: 'Email ou senha inválidos.' };
  }

  const match = await bcrypt.compare(senha, user.passwordHash);
  if (!match) {
    throw { status: 401, message: 'Email ou senha inválidos.' };
  }

  const driverInfo = user.tipo === 'motorista' ? await getDriverInfo(user._id) : null;

  return {
    token: signToken(user._id, user.tipo),
    user: { _id: user._id, nome: user.nome, email: user.email, tipo: user.tipo, avatarUrl: user.avatarUrl },
    ...(driverInfo && { driverId: driverInfo.driverId, driver: driverInfo }),
  };
};
