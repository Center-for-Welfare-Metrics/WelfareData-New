import { Router } from 'express';
import { ChatController } from '../controllers/ChatController';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';

const router = Router();

router.post('/stream', AuthMiddleware, ChatController.stream);

export default router;
