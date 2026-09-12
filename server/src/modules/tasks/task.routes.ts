import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { taskController } from './task.controller';
import {
  validateCreateTask,
  validateUpdateTask,
  validateTaskIdParam,
  validateProjectTaskParams,
  validateTaskFilterQuery,
} from './task.validation';

// Router for nested project tasks: /api/projects/:projectId/tasks
export const projectTasksRouter = Router({ mergeParams: true });

projectTasksRouter.post(
  '/',
  requireAuth,
  requireRole(Role.ADMIN, Role.PM),
  validateProjectTaskParams,
  validateCreateTask,
  (req, res, next) => taskController.create(req, res, next)
);

projectTasksRouter.get(
  '/',
  requireAuth,
  validateProjectTaskParams,
  validateTaskFilterQuery,
  (req, res, next) => taskController.list(req, res, next)
);

// Router for standalone tasks: /api/tasks
export const tasksRouter = Router();

tasksRouter.get(
  '/:id',
  requireAuth,
  validateTaskIdParam,
  (req, res, next) => taskController.getById(req, res, next)
);

tasksRouter.patch(
  '/:id',
  requireAuth,
  validateTaskIdParam,
  validateUpdateTask,
  (req, res, next) => taskController.update(req, res, next)
);

tasksRouter.delete(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN, Role.PM),
  validateTaskIdParam,
  (req, res, next) => taskController.delete(req, res, next)
);

export default tasksRouter;
