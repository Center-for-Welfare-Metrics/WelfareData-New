import { Router } from 'express';
import { ProcessogramController } from '../controllers/ProcessogramController';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';
import { requireRole } from '../middlewares/RoleMiddleware';
import { uploadSvg } from '../../infrastructure/config/upload';

const router = Router();

router.post(
  '/',
  AuthMiddleware,
  requireRole('admin'),
  uploadSvg.single('file'),
  ProcessogramController.create
);

export default router;
