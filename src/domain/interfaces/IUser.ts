export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
