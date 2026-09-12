import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { getRefreshTokenCookieOptions, getClearCookieOptions } from '../../lib/jwt';
import { env } from '../../config/env';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);

      // Set refresh token in HttpOnly cookie
      res.cookie(env.COOKIE_NAME, result.refreshToken, getRefreshTokenCookieOptions());

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.[env.COOKIE_NAME];
      const result = await authService.refresh(refreshToken);

      // Rotate refresh token cookie
      res.cookie(env.COOKIE_NAME, result.refreshToken, getRefreshTokenCookieOptions());

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.[env.COOKIE_NAME];
      await authService.logout(refreshToken);

      res.clearCookie(env.COOKIE_NAME, getClearCookieOptions());

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getMe(req.user!.userId);

      res.status(200).json({
        success: true,
        data: {
          user,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
