import { Router } from 'express';
import { ProcessogramQuestionController } from '../controllers/ProcessogramQuestionController';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';
import { requireRole } from '../middlewares/RoleMiddleware';

const router = Router();

router.put('/:id', AuthMiddleware, requireRole('admin'), ProcessogramQuestionController.update);

export default router;
