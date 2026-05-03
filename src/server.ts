import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database';

dotenv.config();
const app: Application = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use(cors());
app.use(express.json());

app.listen(PORT, () => {
  console.log(`
  ==========================================
  ✅ Servidor online na porta ${PORT}
  📡 Endereço local: http://localhost:${PORT}
  ==========================================
  `);
});