import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { createRide, requestRide, getRidesByDriver, getRidesByPassenger, updateRideStatus } from '../controllers/rideController';

const router = Router();

router.post('/', authMiddleware, createRide);
router.post('/request', authMiddleware, requestRide);
router.get('/driver/:driverId', authMiddleware, getRidesByDriver);
router.get('/passenger/:userId', authMiddleware, getRidesByPassenger);
router.put('/:rideId/status', authMiddleware, updateRideStatus);

export default router;
