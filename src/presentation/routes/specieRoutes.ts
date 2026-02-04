import { Router } from 'express';
import { SpecieController } from '../controllers/SpecieController';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';
import { requireRole } from '../middlewares/RoleMiddleware';

const router = Router();

router.post('/', AuthMiddleware, requireRole('admin'), SpecieController.create);
router.get('/', AuthMiddleware, SpecieController.list);
router.put('/:id', AuthMiddleware, requireRole('admin'), SpecieController.update);
router.delete('/:id', AuthMiddleware, requireRole('admin'), SpecieController.delete);

export default router;
