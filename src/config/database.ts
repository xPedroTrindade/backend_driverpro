import { prisma } from '../lib/prisma';

// Abre a conexão no boot para falhar cedo se DATABASE_URL estiver errada.
const connectDB = async () => {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('A variável DATABASE_URL não foi definida no .env');
    }

    await prisma.$connect();

    console.log('Postgres (Supabase) conectado com sucesso!');
  } catch (error) {
    console.error('Erro ao conectar ao Postgres:', error);
    process.exit(1);
  }
};

export default connectDB;
