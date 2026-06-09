import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard, type AuthedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { sensitiveLimiter } from '../../middleware/rateLimit.middleware';
import { profileService } from './profile.service';
import { updateProfileSchema } from '../auth/auth.schema';
import { HttpError } from '../../utils/HttpError';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new HttpError(400, 'UnsupportedImage') as unknown as Error);
    cb(null, true);
  },
});

export const profileRouter = Router();
profileRouter.use(authGuard);

profileRouter.patch(
  '/',
  validate(updateProfileSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await profileService.update(req.userId!, req.body));
  }),
);

profileRouter.post(
  '/avatar',
  sensitiveLimiter,
  upload.single('avatar'),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!req.file) throw new HttpError(400, 'NoFile');
    res.json(await profileService.setAvatar(req.userId!, req.file.buffer, req.file.mimetype));
  }),
);

profileRouter.delete(
  '/avatar',
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await profileService.clearAvatar(req.userId!));
  }),
);
