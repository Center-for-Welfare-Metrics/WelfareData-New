import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export interface ITokenPayload {
  id: string;
  role: string;
}

export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || '';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '12h';
    if (!this.jwtSecret) {
      throw new Error('FATAL: JWT_SECRET não definido nas variáveis de ambiente.');
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async comparePassword(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  generateToken(payload: ITokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn } as jwt.SignOptions);
  }

  verifyToken(token: string): ITokenPayload {
    return jwt.verify(token, this.jwtSecret) as ITokenPayload;
  }
}
