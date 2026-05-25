import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { getNotifications, markAsRead, markAllAsRead, getUnreadCount } from '../controllers/notificationController';

const router = Router();

router.get('/', authMiddleware, getNotifications);
router.get('/unread-count', authMiddleware, getUnreadCount);
router.put('/read-all', authMiddleware, markAllAsRead);
router.put('/:notifId/read', authMiddleware, markAsRead);

export default router;
