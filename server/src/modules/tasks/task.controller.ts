import { Request, Response, NextFunction } from 'express';
import { taskService } from './task.service';
import { getParamString } from '../projects/project.validation';

export class TaskController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const task = await taskService.createTask(
        req.user!.userId,
        req.user!.role,
        getParamString(req.params.projectId),
        req.body
      );
      res.status(201).json({
        success: true,
        data: { task },
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tasks = await taskService.listProjectTasks(
        req.user!.userId,
        req.user!.role,
        getParamString(req.params.projectId),
        (req as any).taskFilters
      );
      res.status(200).json({
        success: true,
        data: { tasks },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const task = await taskService.getTaskById(
        req.user!.userId,
        req.user!.role,
        getParamString(req.params.id)
      );
      res.status(200).json({
        success: true,
        data: { task },
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const task = await taskService.updateTask(
        req.user!.userId,
        req.user!.role,
        getParamString(req.params.id),
        req.body
      );
      res.status(200).json({
        success: true,
        data: { task },
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await taskService.deleteTask(
        req.user!.userId,
        req.user!.role,
        getParamString(req.params.id)
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const taskController = new TaskController();
