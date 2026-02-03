import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthService } from '../../application/services/AuthService';
import { RegisterUserUseCase } from '../../application/useCases/auth/RegisterUserUseCase';
import { LoginUseCase } from '../../application/useCases/auth/LoginUseCase';

export class AuthController {
  static async register(req: Request, res: Response) {
    const authService = new AuthService();
    const useCase = new RegisterUserUseCase(authService);
    try {
      const user = await useCase.execute(req.body);
      return res.status(201).json(user);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.errors,
        });
      }
      if (error.message === 'User already exists') {
        return res.status(409).json({ error: 'User already exists' });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async login(req: Request, res: Response) {
    const authService = new AuthService();
    const useCase = new LoginUseCase(authService);
    try {
      const result = await useCase.execute(req.body);

      // Set token as HttpOnly cookie
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 12 * 3600000, // 12 hours
      });

      return res.status(200).json({ user: result.user });
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: 'Validation Error', details: error.errors });
      }
      if (error.message === 'Invalid credentials') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
