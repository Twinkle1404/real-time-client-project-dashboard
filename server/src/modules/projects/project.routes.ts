import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { projectController } from './project.controller';
import {
  validateCreateProject,
  validateUpdateProject,
  validateProjectIdParam,
} from './project.validation';

import { projectTasksRouter } from '../tasks/task.routes';

const router = Router();

// Mount nested tasks router: /api/projects/:projectId/tasks
router.use('/:projectId/tasks', projectTasksRouter);

router.post(
  '/',
  requireAuth,
  requireRole(Role.ADMIN, Role.PM),
  validateCreateProject,
  (req, res, next) => projectController.create(req, res, next)
);

router.get(
  '/',
  requireAuth,
  (req, res, next) => projectController.list(req, res, next)
);

router.get(
  '/:id',
  requireAuth,
  validateProjectIdParam,
  (req, res, next) => projectController.getById(req, res, next)
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN, Role.PM),
  validateProjectIdParam,
  validateUpdateProject,
  (req, res, next) => projectController.update(req, res, next)
);

router.delete(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN, Role.PM),
  validateProjectIdParam,
  (req, res, next) => projectController.delete(req, res, next)
);

export default router;
