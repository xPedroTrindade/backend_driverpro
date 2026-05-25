import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { createVehicle, getVehicleByDriver, updateVehicle, deleteVehicle } from '../controllers/vehicleController';

const router = Router();

router.post('/', authMiddleware, createVehicle);
router.get('/driver/:driverId', authMiddleware, getVehicleByDriver);
router.put('/:vehicleId', authMiddleware, updateVehicle);
router.delete('/:vehicleId', authMiddleware, deleteVehicle);

export default router;
