import { z } from 'zod';
import { UserModel } from '../../../infrastructure/models/UserModel';
import { AuthService } from '../../services/AuthService';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must have at least 6 characters'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export class LoginUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(input: LoginInput) {
    const data = LoginSchema.parse(input);

    const user = await UserModel.findOne({ email: data.email }).select('+passwordHash');

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordMatches = await this.authService.comparePassword(data.password, user.passwordHash);
    if (!passwordMatches) {
      throw new Error('Invalid credentials');
    }

    const token = this.authService.generateToken({ id: user._id.toString(), role: user.role });

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }
}
