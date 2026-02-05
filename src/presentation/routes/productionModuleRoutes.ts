import { Router } from 'express';
import { ProductionModuleController } from '../controllers/ProductionModuleController';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';
import { requireRole } from '../middlewares/RoleMiddleware';

const router = Router();

router.post('/', AuthMiddleware, requireRole('admin'), ProductionModuleController.create);
router.get('/', AuthMiddleware, ProductionModuleController.list);
router.patch('/:id', AuthMiddleware, requireRole('admin'), ProductionModuleController.update);
router.delete('/:id', AuthMiddleware, requireRole('admin'), ProductionModuleController.delete);

export default router;
