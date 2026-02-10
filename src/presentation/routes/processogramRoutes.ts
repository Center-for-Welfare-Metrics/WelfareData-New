import { Router } from 'express';
import { ProcessogramController } from '../controllers/ProcessogramController';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';
import { requireRole } from '../middlewares/RoleMiddleware';
import { uploadSvg } from '../../infrastructure/config/upload';

const router = Router();

router.get('/', AuthMiddleware, ProcessogramController.list);
router.get('/:id', AuthMiddleware, ProcessogramController.show);

router.post(
  '/',
  AuthMiddleware,
  requireRole('admin'),
  uploadSvg.single('file'),
  ProcessogramController.create
);

router.delete('/:id', AuthMiddleware, requireRole('admin'), ProcessogramController.delete);

export default router;
