import multer from 'multer';
import { Request } from 'express';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req: Request, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Apenas imagens JPEG e PNG são aceitas.'));
    }
    cb(null, true);
  },
}).single('avatar');
