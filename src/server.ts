import 'dotenv/config'; // primeiro import: carrega o .env antes de qualquer módulo ler process.env
import connectDB from './config/database';
import app from './app';

const PORT = process.env.PORT || 3000;

connectDB();

app.listen(PORT, () => {
  console.log(`
  ==========================================
  ✅ Servidor online na porta ${PORT}
  📡 Endereço local: http://localhost:${PORT}
  ==========================================
  `);
});
