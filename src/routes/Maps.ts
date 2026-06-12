import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { getRoutes } from '../controllers/mapsController';

const router = Router();

router.post('/routes', authMiddleware, getRoutes);

export default router;
