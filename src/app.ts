import express, { Application, Request, Response } from 'express';
import cors from 'cors';

import authRoutes from './routes/Auth';
import driverRoutes from './routes/Driver';
import rideRoutes from './routes/Ride';
import vehicleRoutes from './routes/Vehicle';
import unavailablePeriodRoutes from './routes/UnavailablePeriod';
import notificationRoutes from './routes/Notification';
import userRoutes from './routes/User';
import mapsRoutes from './routes/Maps';

// App Express sem efeitos colaterais (não conecta no banco nem abre porta).
// Quem sobe o servidor é o server.ts; os testes importam este arquivo direto.
const app: Application = express();

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

export default app;
