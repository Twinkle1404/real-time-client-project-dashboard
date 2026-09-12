import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken } from '../lib/jwt';
import { unauthorized, forbidden } from '../lib/errors';
import jwt from 'jsonwebtoken';

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(unauthorized('UNAUTHORIZED', 'Authorization header is missing'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].trim()) {
    return next(unauthorized('INVALID_TOKEN', 'Authorization header format must be Bearer <token>'));
  }

  const token = parts[1].trim();

  try {
    const payload = verifyAccessToken(token);

    if (!payload.userId || !payload.role) {
      return next(unauthorized('INVALID_TOKEN', 'Malformed token payload'));
    }

    req.user = {
      userId: payload.userId,
      role: payload.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(unauthorized('TOKEN_EXPIRED', 'Access token has expired'));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(unauthorized('INVALID_TOKEN', 'Invalid or tampered access token'));
    }
    return next(unauthorized('UNAUTHORIZED', 'Token verification failed'));
  }
};

export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(unauthorized('UNAUTHORIZED', 'Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(forbidden('FORBIDDEN', 'You do not have permission to access this resource'));
    }

    next();
  };
};
