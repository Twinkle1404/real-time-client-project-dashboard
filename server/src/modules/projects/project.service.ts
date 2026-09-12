import { Role } from '@prisma/client';
import prisma from '../../lib/prisma';
import { safeUserSelect } from '../../lib/serializers';
import { badRequest, forbidden, notFound, conflict } from '../../lib/errors';
import { CreateProjectDto, UpdateProjectDto } from './project.types';

export class ProjectService {
  async createProject(userId: string, role: Role, dto: CreateProjectDto) {
    if (role === Role.DEVELOPER) {
      throw forbidden('FORBIDDEN', 'Developers are not permitted to create projects');
    }

    const client = await prisma.client.findUnique({
      where: { id: dto.clientId },
    });
    if (!client) {
      throw badRequest('VALIDATION_ERROR', 'Referenced client does not exist');
    }

    return await prisma.project.create({
      data: {
        name: dto.name,
        clientId: dto.clientId,
        createdBy: userId,
      },
      include: {
        client: true,
        creator: { select: safeUserSelect },
        _count: { select: { tasks: true } },
      },
    });
  }

  async listProjects(userId: string, role: Role) {
    if (role === Role.ADMIN) {
      return await prisma.project.findMany({
        include: {
          client: true,
          creator: { select: safeUserSelect },
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (role === Role.PM) {
      return await prisma.project.findMany({
        where: { createdBy: userId },
        include: {
          client: true,
          creator: { select: safeUserSelect },
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // DEVELOPER: scoped strictly to projects where user is assigned to at least one task
    return await prisma.project.findMany({
      where: {
        tasks: {
          some: {
            assignedTo: userId,
          },
        },
      },
      include: {
        client: true,
        creator: { select: safeUserSelect },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProjectById(userId: string, role: Role, projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
        creator: { select: safeUserSelect },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            assignedTo: true,
            dueDate: true,
          },
        },
        _count: { select: { tasks: true } },
      },
    });

    if (!project) {
      throw notFound('NOT_FOUND', 'Project not found');
    }

    // Role-level ownership and authorization check
    if (role === Role.PM && project.createdBy !== userId) {
      throw forbidden('FORBIDDEN', 'You do not have permission to view this project');
    }

    if (role === Role.DEVELOPER) {
      const isAssigned = project.tasks.some((t) => t.assignedTo === userId);
      if (!isAssigned) {
        throw forbidden('FORBIDDEN', 'You do not have permission to view this project');
      }

      // Filter tasks to only those assigned to this developer
      project.tasks = project.tasks.filter((t) => t.assignedTo === userId);
    }

    return project;
  }

  async updateProject(userId: string, role: Role, projectId: string, dto: UpdateProjectDto) {
    if (role === Role.DEVELOPER) {
      throw forbidden('FORBIDDEN', 'Developers are not permitted to update projects');
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw notFound('NOT_FOUND', 'Project not found');
    }

    if (role === Role.PM && project.createdBy !== userId) {
      throw forbidden('FORBIDDEN', 'You can only update projects you created');
    }

    if (dto.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: dto.clientId },
      });
      if (!client) {
        throw badRequest('VALIDATION_ERROR', 'Referenced client does not exist');
      }
    }

    return await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.clientId ? { clientId: dto.clientId } : {}),
      },
      include: {
        client: true,
        creator: { select: safeUserSelect },
        _count: { select: { tasks: true } },
      },
    });
  }

  async deleteProject(userId: string, role: Role, projectId: string) {
    if (role === Role.DEVELOPER) {
      throw forbidden('FORBIDDEN', 'Developers are not permitted to delete projects');
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: { select: { tasks: true, activityLogs: true } },
      },
    });

    if (!project) {
      throw notFound('NOT_FOUND', 'Project not found');
    }

    if (role === Role.PM && project.createdBy !== userId) {
      throw forbidden('FORBIDDEN', 'You can only delete projects you created');
    }

    // Protect foreign key relationships from corruption
    if (project._count.tasks > 0 || project._count.activityLogs > 0) {
      throw conflict('CONFLICT', 'Cannot delete project with existing tasks or activity logs');
    }

    await prisma.project.delete({
      where: { id: projectId },
    });
  }
}

export const projectService = new ProjectService();
