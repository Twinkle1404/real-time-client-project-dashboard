export type Role = 'ADMIN' | 'PM' | 'DEVELOPER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthSuccessResponse {
  success: true;
  data: {
    accessToken: string;
    user: User;
  };
}

export interface RefreshSuccessResponse {
  success: true;
  data: {
    accessToken: string;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
