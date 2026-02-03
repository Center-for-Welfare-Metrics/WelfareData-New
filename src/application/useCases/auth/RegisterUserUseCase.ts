import { z } from 'zod';
import { UserModel } from '../../../infrastructure/models/UserModel';
import { AuthService } from '../../services/AuthService';
import { UserRole } from '../../../domain/interfaces/IUser';

export const RegisterSchema = z.object({
  name: z.string().min(3, 'Name must have at least 3 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must have at least 6 characters'),
  role: z.enum([UserRole.ADMIN, UserRole.USER]).optional().default(UserRole.USER),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export class RegisterUserUseCase {
  private readonly authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async execute(input: RegisterInput) {
    // Validação Zod
    const data = RegisterSchema.parse(input);

    // Verifica se o email já existe
    const exists = await UserModel.findOne({ email: data.email });
    if (exists) {
      throw new Error('User already exists');
    }

    // Criptografa a senha
    const passwordHash = await this.authService.hashPassword(data.password);

    // Cria o usuário
    const user = await UserModel.create({
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      isActive: true,
    });

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };
  }
}
