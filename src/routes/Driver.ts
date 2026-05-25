import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { ownershipMiddleware } from '../middlewares/ownership';
import {
  listDrivers,
  getDriver,
  updatePricing,
  toggleAvailability,
  getTodaySummary,
  getNextRide,
  getPendingCount,
  getScheduleMonth,
} from '../controllers/driverController';

const router = Router();

router.get('/', authMiddleware, listDrivers);
router.get('/:driverId', authMiddleware, ownershipMiddleware, getDriver);
router.put('/:driverId/pricing', authMiddleware, ownershipMiddleware, updatePricing);
router.put('/:driverId/availability', authMiddleware, ownershipMiddleware, toggleAvailability);
router.get('/:driverId/summary', authMiddleware, ownershipMiddleware, getTodaySummary);
router.get('/:driverId/next-ride', authMiddleware, ownershipMiddleware, getNextRide);
router.get('/:driverId/pending-count', authMiddleware, ownershipMiddleware, getPendingCount);
router.get('/:driverId/schedule', authMiddleware, ownershipMiddleware, getScheduleMonth);

export default router;
