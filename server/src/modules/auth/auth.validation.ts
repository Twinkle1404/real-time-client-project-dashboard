import { Request, Response, NextFunction } from 'express';
import { badRequest } from '../../lib/errors';
import { LoginDto } from './auth.types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateLogin = (req: Request, _res: Response, next: NextFunction): void => {
  const { email, password } = req.body as Partial<LoginDto>;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return next(badRequest('VALIDATION_ERROR', 'Email is required'));
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return next(badRequest('VALIDATION_ERROR', 'Invalid email address format'));
  }

  if (!password || typeof password !== 'string') {
    return next(badRequest('VALIDATION_ERROR', 'Password is required'));
  }

  if (password.length === 0) {
    return next(badRequest('VALIDATION_ERROR', 'Password cannot be empty'));
  }

  // Normalize email in request body
  req.body.email = normalizedEmail;
  next();
};
