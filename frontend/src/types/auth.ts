export enum UserRole {
  ADMIN = "admin",
  USER = "user",
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
}

export interface AuthErrorResponse {
  error: string;
  details?: unknown;
}
