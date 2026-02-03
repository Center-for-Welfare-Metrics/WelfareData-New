import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthService } from '../../application/services/AuthService';
import { RegisterUserUseCase, RegisterSchema } from '../../application/useCases/auth/RegisterUserUseCase';

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
}
