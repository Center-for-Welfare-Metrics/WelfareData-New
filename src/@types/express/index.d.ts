import { ITokenPayload } from '../../application/services/AuthService';

declare global {
  namespace Express {
    interface Request {
      user?: ITokenPayload;
    }
  }
}

export {};
