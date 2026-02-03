import { Request, Response, NextFunction } from 'express';

export const requireRole = (allowedRole: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as { role?: string } | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (user.role !== allowedRole) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
};
