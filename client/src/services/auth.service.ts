import {
  LoginCredentials,
  AuthSuccessResponse,
  RefreshSuccessResponse,
  User,
  ApiErrorResponse,
} from '../types/auth.types';

const API_BASE = '/api/auth';

export class AuthService {
  /**
   * Log in user with credentials.
   * Refresh token is set automatically in an HttpOnly cookie by the server.
   */
  async login(credentials: LoginCredentials): Promise<AuthSuccessResponse['data']> {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Includes cookies for cross-origin / proxy requests
      body: JSON.stringify(credentials),
    });

    const data = await res.json();
    if (!res.ok) {
      const errorData = data as ApiErrorResponse;
      throw new Error(errorData.error?.message || 'Login failed');
    }

    return (data as AuthSuccessResponse).data;
  }

  /**
   * Refresh the access token using the HttpOnly cookie.
   * Does NOT touch localStorage.
   */
  async refresh(): Promise<string> {
    const res = await fetch(`${API_BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      const errorData = data as ApiErrorResponse;
      throw new Error(errorData.error?.message || 'Token refresh failed');
    }

    return (data as RefreshSuccessResponse).data.accessToken;
  }

  /**
   * Fetch current authenticated user profile using the access token.
   */
  async getMe(accessToken: string): Promise<User> {
    const res = await fetch(`${API_BASE}/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      const errorData = data as ApiErrorResponse;
      throw new Error(errorData.error?.message || 'Failed to fetch user profile');
    }

    return data.data.user;
  }

  /**
   * Log out user and clear HttpOnly refresh cookie.
   */
  async logout(): Promise<void> {
    await fetch(`${API_BASE}/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  }
}

export const authService = new AuthService();
