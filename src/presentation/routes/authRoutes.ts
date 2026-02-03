import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';
import { requireRole } from '../middlewares/RoleMiddleware';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/me', AuthMiddleware, AuthController.me);
router.post('/logout', AuthController.logout);

// Admin only test route
router.get('/admin-only', AuthMiddleware, requireRole('admin'), (req, res) => {
	return res.status(200).json({ message: 'Welcome Admin' });
});

export default router;
