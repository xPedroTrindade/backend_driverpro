import { Router } from 'express';
import { register } from '../controllers/authController';
import { verifyTokenMiddleware } from '../middlewares/verifyToken';

const router = Router();

// POST /auth/register
// Frontend deve criar o usuário no Firebase primeiro, depois chamar este endpoint
// com o idToken no header Authorization: Bearer <token>
router.post('/register', verifyTokenMiddleware, register);

export default router;
