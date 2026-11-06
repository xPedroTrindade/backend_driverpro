import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { ownershipMiddleware } from '../middlewares/ownership';
import { createRide, requestRide, getRidesByDriver, getRidesByPassenger, updateRideStatus, quoteRide, confirmRide } from '../controllers/rideController';

const router = Router();

router.post('/', authMiddleware, createRide);
router.post('/request', authMiddleware, requestRide);
router.get('/driver/:driverId', authMiddleware, ownershipMiddleware, getRidesByDriver);
router.get('/passenger/:userId', authMiddleware, getRidesByPassenger);
router.put('/:rideId/quote', authMiddleware, quoteRide);
router.put('/:rideId/confirm', authMiddleware, confirmRide);
router.put('/:rideId/status', authMiddleware, updateRideStatus);

export default router;
