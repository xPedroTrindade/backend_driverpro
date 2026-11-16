import dotenv from 'dotenv';
import connectDB from './config/database';
import app from './app';

dotenv.config();
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
