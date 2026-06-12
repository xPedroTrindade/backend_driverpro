import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database';

import authRoutes from './routes/Auth';
import driverRoutes from './routes/Driver';
import rideRoutes from './routes/Ride';
import vehicleRoutes from './routes/Vehicle';
import unavailablePeriodRoutes from './routes/UnavailablePeriod';
import notificationRoutes from './routes/Notification';
import userRoutes from './routes/User';
import mapsRoutes from './routes/Maps';

dotenv.config();
const app: Application = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/unavailable-periods', unavailablePeriodRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/maps', mapsRoutes);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`
  ==========================================
  ✅ Servidor online na porta ${PORT}
  📡 Endereço local: http://localhost:${PORT}
  ==========================================
  `);
});
