import { Router } from 'express';
import { ProcessogramController } from '../controllers/ProcessogramController';
import { ProcessogramAIController } from '../controllers/ProcessogramAIController';
import { ProcessogramDataController } from '../controllers/ProcessogramDataController';
import { ProcessogramQuestionController } from '../controllers/ProcessogramQuestionController';
import { ChatController } from '../controllers/ChatController';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';
import { requireRole } from '../middlewares/RoleMiddleware';
import { uploadSvg } from '../../infrastructure/config/upload';

import { Request, Response, NextFunction } from 'express';

const router = Router();

// 🔍 DEBUG: Multer error handler wrapper
const multerDebug = (req: Request, res: Response, next: NextFunction) => {
  console.log('🟡 [DEBUG] Before Multer — starting file parse');
  uploadSvg.single('file')(req, res, (err: any) => {
    if (err) {
      console.error('🔴 [DEBUG] Multer ERROR:', err.message, err.code, err);
      return res.status(400).json({ error: `Upload failed: ${err.message}` });
    }
    console.log('🟡 [DEBUG] After Multer — file parsed OK, size:', req.file?.size);
    next();
  });
};

// Private — Auth required
router.get('/', AuthMiddleware, ProcessogramController.list);

// Public — Accessible without authentication (shareability)
router.get('/:id', ProcessogramController.show);
router.get('/:id/svg', ProcessogramController.svg);
router.get('/:processogramId/data/public', ProcessogramDataController.listByProcessogram);
router.get('/:processogramId/questions/public', ProcessogramQuestionController.listByProcessogram);
router.post('/:processogramId/chat/stream', ChatController.stream);

router.post(
  '/',
  (req: Request, _res: Response, next: NextFunction) => { console.log('🟡 [DEBUG] POST / — Auth check starting'); next(); },
  AuthMiddleware,
  (req: Request, _res: Response, next: NextFunction) => { console.log('🟡 [DEBUG] POST / — Auth passed, role check next'); next(); },
  requireRole('admin'),
  (req: Request, _res: Response, next: NextFunction) => { console.log('🟡 [DEBUG] POST / — Role passed, multer next'); next(); },
  multerDebug,
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
