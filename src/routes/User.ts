import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { avatarUpload } from '../middlewares/upload';
import { getProfile, updateProfile, uploadAvatar, getAvatar } from '../controllers/userController';

const router = Router();

router.get('/:id/avatar', getAvatar);
router.get('/:id', authMiddleware, getProfile);
router.put('/:id', authMiddleware, updateProfile);
router.post(
  '/:id/avatar',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    avatarUpload(req, res, (err) => {
      if (err?.message === 'File too large') {
        res.status(422).json({ error: 'O arquivo deve ter no máximo 2MB.' }); return;
      }
      if (err) { res.status(422).json({ error: err.message }); return; }
      next();
    });
  },
  uploadAvatar
);

export default router;
