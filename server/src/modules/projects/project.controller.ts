import { Request, Response, NextFunction } from 'express';
import { projectService } from './project.service';
import { getParamString } from './project.validation';

export class ProjectController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectService.createProject(
        req.user!.userId,
        req.user!.role,
        req.body
      );
      res.status(201).json({
        success: true,
        data: { project },
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projects = await projectService.listProjects(
        req.user!.userId,
        req.user!.role
      );
      res.status(200).json({
        success: true,
        data: { projects },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectService.getProjectById(
        req.user!.userId,
        req.user!.role,
        getParamString(req.params.id)
      );
      res.status(200).json({
        success: true,
        data: { project },
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectService.updateProject(
        req.user!.userId,
        req.user!.role,
        getParamString(req.params.id),
        req.body
      );
      res.status(200).json({
        success: true,
        data: { project },
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await projectService.deleteProject(
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

export const projectController = new ProjectController();
