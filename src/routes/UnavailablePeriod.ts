import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { getPeriods, createPeriod, deletePeriod } from '../controllers/unavailablePeriodController';

const router = Router();

router.get('/driver/:driverId', authMiddleware, getPeriods);
router.post('/', authMiddleware, createPeriod);
router.delete('/:periodId', authMiddleware, deletePeriod);

export default router;
