import { Router } from 'express';
import { ProcessogramDataController } from '../controllers/ProcessogramDataController';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';
import { requireRole } from '../middlewares/RoleMiddleware';

const router = Router();

router.put('/:id', AuthMiddleware, requireRole('admin'), ProcessogramDataController.update);

export default router;
