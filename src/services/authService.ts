import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { RegisterInput } from '../validators/authValidator';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/errors';

// Antes era o hook pre('save') do Mongoose; agora o hash é explícito.
const SALT_ROUNDS = 10;
export const hashPassword = (senha: string) => bcrypt.hash(senha, SALT_ROUNDS);

async function getDriverInfo(userId: string) {
  const driver = await prisma.driver.findUnique({
    where: { userId },
    select: { id: true, precoKm: true, disponivel: true },
  });
  return driver
    ? { driverId: driver.id, precoKm: driver.precoKm.toNumber(), disponivel: driver.disponivel }
    : null;
}

const JWT_EXPIRES_IN = '7d';

function signToken(id: string, tipo: string) {
  return jwt.sign({ id, tipo }, process.env.JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
}

export const registerUser = async (data: RegisterInput) => {
  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    throw { status: 409, message: 'Este email já está cadastrado.' };
  }

  // Usuário + perfil (motorista ou passageiro) numa única escrita atômica.
  let user;
  try {
    user = await prisma.user.create({
      data: {
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        tipo: data.tipo,
        passwordHash: await hashPassword(data.senha),
        ...(data.tipo === 'motorista'
          ? { driver: { create: { precoKm: data.precoKm ?? 0 } } }
          : { passenger: { create: {} } }),
      },
    });
  } catch (err) {
    // Dois cadastros simultâneos com o mesmo e-mail: o UNIQUE do banco decide.
    if (isUniqueViolation(err, 'email')) throw { status: 409, message: 'Este email já está cadastrado.' };
    throw err;
  }

  const driverInfo = data.tipo === 'motorista' ? await getDriverInfo(user.id) : null;

  return {
    token: signToken(user.id, user.tipo),
    user: { _id: user.id, nome: user.nome, email: user.email, tipo: user.tipo },
    ...(driverInfo && { driverId: driverInfo.driverId, driver: driverInfo }),
  };
};

export const loginUser = async (email: string, senha: string) => {
  const user = await prisma.user.findUnique({ where: { email }, omit: { passwordHash: false } });

  if (!user || !user.passwordHash) {
    throw { status: 401, message: 'Email ou senha inválidos.' };
  }

  const match = await bcrypt.compare(senha, user.passwordHash);
  if (!match) {
    throw { status: 401, message: 'Email ou senha inválidos.' };
  }

  const driverInfo = user.tipo === 'motorista' ? await getDriverInfo(user.id) : null;

  return {
    token: signToken(user.id, user.tipo),
    user: { _id: user.id, nome: user.nome, email: user.email, tipo: user.tipo, avatarUrl: user.avatarUrl },
    ...(driverInfo && { driverId: driverInfo.driverId, driver: driverInfo }),
  };
};
