import { Request, Response, NextFunction } from 'express';
import { badRequest } from '../../lib/errors';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUuid = (value: string): boolean => {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
};

export const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return typeof param === 'string' ? param : '';
};

export const validateProjectIdParam = (req: Request, _res: Response, next: NextFunction): void => {
  const id = getParamString(req.params.id);
  if (!id || !isValidUuid(id)) {
    return next(badRequest('VALIDATION_ERROR', 'Project ID must be a valid UUID'));
  }
  req.params.id = id;
  next();
};

export const validateCreateProject = (req: Request, _res: Response, next: NextFunction): void => {
  const { name, clientId } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(badRequest('VALIDATION_ERROR', 'Project name is required and cannot be empty'));
  }

  if (name.trim().length > 100) {
    return next(badRequest('VALIDATION_ERROR', 'Project name cannot exceed 100 characters'));
  }

  if (!clientId || typeof clientId !== 'string' || !isValidUuid(clientId)) {
    return next(badRequest('VALIDATION_ERROR', 'A valid client UUID is required'));
  }

  // Sanitize input & strip any malicious client-supplied ownership fields
  req.body.name = name.trim();
  req.body.clientId = clientId.trim();
  delete req.body.createdBy;
  delete req.body.id;
  delete req.body.createdAt;

  next();
};

export const validateUpdateProject = (req: Request, _res: Response, next: NextFunction): void => {
  const { name, clientId } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return next(badRequest('VALIDATION_ERROR', 'Project name cannot be empty'));
    }
    if (name.trim().length > 100) {
      return next(badRequest('VALIDATION_ERROR', 'Project name cannot exceed 100 characters'));
    }
    req.body.name = name.trim();
  }

  if (clientId !== undefined) {
    if (typeof clientId !== 'string' || !isValidUuid(clientId)) {
      return next(badRequest('VALIDATION_ERROR', 'Client ID must be a valid UUID'));
    }
    req.body.clientId = clientId.trim();
  }

  if (name === undefined && clientId === undefined) {
    return next(badRequest('VALIDATION_ERROR', 'At least one field (name or clientId) must be provided for update'));
  }

  // Never allow client to overwrite createdBy or id
  delete req.body.createdBy;
  delete req.body.id;
  delete req.body.createdAt;

  next();
};
