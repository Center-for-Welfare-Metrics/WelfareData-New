import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../application/services/AuthService';

export const AuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const authService = new AuthService();

  try {
    const payload = authService.verifyToken(token);
    // anexar payload ao request (req.user)
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
