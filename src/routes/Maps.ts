import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { getRoutes, getAutocomplete, getPlace } from '../controllers/mapsController';

const router = Router();

router.post('/routes', authMiddleware, getRoutes);
router.get('/autocomplete', authMiddleware, getAutocomplete);
router.get('/place/:placeId', authMiddleware, getPlace);

export default router;
