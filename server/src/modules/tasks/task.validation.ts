import { Request, Response, NextFunction } from 'express';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { badRequest } from '../../lib/errors';
import { isValidUuid, getParamString } from '../projects/project.validation';

const VALID_STATUSES: string[] = Object.values(TaskStatus);
const VALID_PRIORITIES: string[] = Object.values(TaskPriority);

export const validateTaskIdParam = (req: Request, _res: Response, next: NextFunction): void => {
  const id = getParamString(req.params.id);
  if (!id || !isValidUuid(id)) {
    return next(badRequest('VALIDATION_ERROR', 'Task ID must be a valid UUID'));
  }
  req.params.id = id;
  next();
};

export const validateProjectTaskParams = (req: Request, _res: Response, next: NextFunction): void => {
  const projectId = getParamString(req.params.projectId);
  if (!projectId || !isValidUuid(projectId)) {
    return next(badRequest('VALIDATION_ERROR', 'Project ID must be a valid UUID'));
  }
  req.params.projectId = projectId;
  next();
};

export const validateCreateTask = (req: Request, _res: Response, next: NextFunction): void => {
  const { title, description, assignedTo, status, priority, dueDate } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return next(badRequest('VALIDATION_ERROR', 'Task title is required and cannot be empty'));
  }

  if (title.trim().length > 200) {
    return next(badRequest('VALIDATION_ERROR', 'Task title cannot exceed 200 characters'));
  }

  if (!assignedTo || typeof assignedTo !== 'string' || !isValidUuid(assignedTo)) {
    return next(badRequest('VALIDATION_ERROR', 'A valid assigned developer UUID is required'));
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return next(
      badRequest('VALIDATION_ERROR', `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`)
    );
  }

  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return next(
      badRequest('VALIDATION_ERROR', `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`)
    );
  }

  if (dueDate !== undefined && dueDate !== null) {
    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      return next(badRequest('VALIDATION_ERROR', 'Invalid due date format. Expected ISO-8601 string'));
    }
    req.body.dueDate = parsedDate.toISOString();
  }

  req.body.title = title.trim();
  req.body.assignedTo = assignedTo.trim();
  if (description !== undefined && typeof description === 'string') {
    req.body.description = description.trim();
  }

  // Never accept client-supplied ID or projectId override
  delete req.body.id;
  delete req.body.projectId;
  delete req.body.createdAt;
  delete req.body.isOverdue;

  next();
};

export const validateUpdateTask = (req: Request, _res: Response, next: NextFunction): void => {
  const { title, description, assignedTo, status, priority, dueDate } = req.body;

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return next(badRequest('VALIDATION_ERROR', 'Task title cannot be empty'));
    }
    if (title.trim().length > 200) {
      return next(badRequest('VALIDATION_ERROR', 'Task title cannot exceed 200 characters'));
    }
    req.body.title = title.trim();
  }

  if (assignedTo !== undefined) {
    if (typeof assignedTo !== 'string' || !isValidUuid(assignedTo)) {
      return next(badRequest('VALIDATION_ERROR', 'Assigned user ID must be a valid UUID'));
    }
    req.body.assignedTo = assignedTo.trim();
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return next(
      badRequest('VALIDATION_ERROR', `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`)
    );
  }

  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return next(
      badRequest('VALIDATION_ERROR', `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`)
    );
  }

  if (dueDate !== undefined && dueDate !== null) {
    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      return next(badRequest('VALIDATION_ERROR', 'Invalid due date format. Expected ISO-8601 string'));
    }
    req.body.dueDate = parsedDate.toISOString();
  }

  if (description !== undefined && typeof description === 'string') {
    req.body.description = description.trim();
  }

  if (
    title === undefined &&
    description === undefined &&
    assignedTo === undefined &&
    status === undefined &&
    priority === undefined &&
    dueDate === undefined
  ) {
    return next(badRequest('VALIDATION_ERROR', 'At least one field must be provided for update'));
  }

  // Never accept client-supplied ID or projectId override
  delete req.body.id;
  delete req.body.projectId;
  delete req.body.createdAt;
  delete req.body.isOverdue;

  next();
};

export const validateTaskFilterQuery = (req: Request, _res: Response, next: NextFunction): void => {
  const { status, priority, fromDate, toDate } = req.query;

  let parsedStatus: TaskStatus | undefined = undefined;
  let parsedPriority: TaskPriority | undefined = undefined;
  let parsedFrom: Date | undefined = undefined;
  let parsedTo: Date | undefined = undefined;

  if (status !== undefined) {
    if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
      return next(
        badRequest('VALIDATION_ERROR', `Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}`)
      );
    }
    parsedStatus = status as TaskStatus;
  }

  if (priority !== undefined) {
    if (typeof priority !== 'string' || !VALID_PRIORITIES.includes(priority)) {
      return next(
        badRequest('VALIDATION_ERROR', `Invalid priority filter. Must be one of: ${VALID_PRIORITIES.join(', ')}`)
      );
    }
    parsedPriority = priority as TaskPriority;
  }

  const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  if (fromDate !== undefined) {
    if (typeof fromDate !== 'string' || !fromDate.trim()) {
      return next(badRequest('VALIDATION_ERROR', 'Invalid fromDate format. Expected valid date string'));
    }
    const trimmed = fromDate.trim();
    parsedFrom = DATE_ONLY_REGEX.test(trimmed)
      ? new Date(`${trimmed}T00:00:00.000Z`)
      : new Date(trimmed);

    if (isNaN(parsedFrom.getTime())) {
      return next(badRequest('VALIDATION_ERROR', 'Invalid fromDate format. Expected valid date string'));
    }
  }

  if (toDate !== undefined) {
    if (typeof toDate !== 'string' || !toDate.trim()) {
      return next(badRequest('VALIDATION_ERROR', 'Invalid toDate format. Expected valid date string'));
    }
    const trimmed = toDate.trim();
    parsedTo = DATE_ONLY_REGEX.test(trimmed)
      ? new Date(`${trimmed}T23:59:59.999Z`)
      : new Date(trimmed);

    if (isNaN(parsedTo.getTime())) {
      return next(badRequest('VALIDATION_ERROR', 'Invalid toDate format. Expected valid date string'));
    }
  }

  if (parsedFrom && parsedTo && parsedFrom.getTime() > parsedTo.getTime()) {
    return next(badRequest('VALIDATION_ERROR', 'fromDate cannot be after toDate'));
  }

  (req as any).taskFilters = {
    status: parsedStatus,
    priority: parsedPriority,
    fromDate: parsedFrom,
    toDate: parsedTo,
  };

  next();
};
