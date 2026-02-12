import { Router } from 'express';
import { ProcessogramController } from '../controllers/ProcessogramController';
import { ProcessogramAIController } from '../controllers/ProcessogramAIController';
import { ProcessogramDataController } from '../controllers/ProcessogramDataController';
import { ProcessogramQuestionController } from '../controllers/ProcessogramQuestionController';
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

router.put(
  '/:id',
  AuthMiddleware,
  requireRole('admin'),
  uploadSvg.single('file'),
  ProcessogramController.update
);

router.post('/:id/analyze', AuthMiddleware, requireRole('admin'), ProcessogramAIController.analyze);

router.get('/:processogramId/data', AuthMiddleware, ProcessogramDataController.listByProcessogram);
router.get('/:processogramId/questions', AuthMiddleware, ProcessogramQuestionController.listByProcessogram);

router.delete('/:id', AuthMiddleware, requireRole('admin'), ProcessogramController.delete);

export default router;
