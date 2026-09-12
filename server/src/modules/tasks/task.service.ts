import { Prisma, Role, TaskStatus, TaskPriority } from '@prisma/client';
import prisma from '../../lib/prisma';
import { safeUserSelect } from '../../lib/serializers';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { CreateTaskDto, UpdateTaskDto, ParsedTaskFilters } from './task.types';
import { getIO } from '../../realtime/socket';
import {
  emitTaskStatusChanged,
  emitActivityNew,
  emitNotificationNew,
  emitNotificationUnreadCount,
} from '../../realtime/events';

export class TaskService {
  async createTask(userId: string, role: Role, projectId: string, dto: CreateTaskDto) {
    if (role === Role.DEVELOPER) {
      throw forbidden('FORBIDDEN', 'Developers are not permitted to create tasks');
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw notFound('NOT_FOUND', 'Project not found');
    }

    if (role === Role.PM && project.createdBy !== userId) {
      throw forbidden('FORBIDDEN', 'You can only create tasks in projects you created');
    }

    // Validate that assignedTo references an existing user with role DEVELOPER
    const assignee = await prisma.user.findUnique({
      where: { id: dto.assignedTo },
    });

    if (!assignee) {
      throw badRequest('VALIDATION_ERROR', 'Assigned user does not exist');
    }

    if (assignee.role !== Role.DEVELOPER) {
      throw badRequest('VALIDATION_ERROR', 'Task can only be assigned to a user with DEVELOPER role');
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const isOverdue = dueDate ? dueDate < new Date() && dto.status !== TaskStatus.DONE : false;

    const { createdTask, notification } = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          projectId,
          assignedTo: dto.assignedTo,
          title: dto.title,
          description: dto.description || null,
          status: dto.status || TaskStatus.TODO,
          priority: dto.priority || TaskPriority.MEDIUM,
          dueDate,
          isOverdue,
        },
        include: {
          assignee: { select: safeUserSelect },
          project: { select: { id: true, name: true, createdBy: true } },
        },
      });

      const notif = await tx.notification.create({
        data: {
          userId: dto.assignedTo,
          type: 'TASK_ASSIGNED',
          message: `You were assigned to task: "${task.title}" in project "${project.name}"`,
          relatedTaskId: task.id,
        },
      });

      return { createdTask: task, notification: notif };
    });

    // ONLY AFTER SUCCESSFUL DATABASE COMMIT, emit real-time Socket.IO notification events
    const io = getIO();
    if (io) {
      emitNotificationNew(io, dto.assignedTo, {
        id: notification.id,
        type: notification.type,
        message: notification.message,
        relatedTaskId: notification.relatedTaskId,
        isRead: notification.isRead,
        createdAt: notification.createdAt.toISOString(),
      });

      const unreadCount = await prisma.notification.count({
        where: { userId: dto.assignedTo, isRead: false },
      });
      emitNotificationUnreadCount(io, dto.assignedTo, { unreadCount });
    }

    return createdTask;
  }

  async listProjectTasks(userId: string, role: Role, projectId: string, filters?: ParsedTaskFilters) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw notFound('NOT_FOUND', 'Project not found');
    }

    if (role === Role.PM && project.createdBy !== userId) {
      throw forbidden('FORBIDDEN', 'You can only view tasks in projects you created');
    }

    const where: Prisma.TaskWhereInput = {
      projectId,
    };

    // DEVELOPER: Query is strictly scoped at the database level to own assigned tasks only
    if (role === Role.DEVELOPER) {
      where.assignedTo = userId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.priority) {
      where.priority = filters.priority;
    }

    if (filters?.fromDate || filters?.toDate) {
      where.dueDate = {
        ...(filters.fromDate ? { gte: filters.fromDate } : {}),
        ...(filters.toDate ? { lte: filters.toDate } : {}),
      };
    }

    return await prisma.task.findMany({
      where,
      include: {
        assignee: { select: safeUserSelect },
        project: { select: { id: true, name: true, createdBy: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTaskById(userId: string, role: Role, taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: safeUserSelect },
        project: { select: { id: true, name: true, createdBy: true } },
      },
    });

    if (!task) {
      throw notFound('NOT_FOUND', 'Task not found');
    }

    if (role === Role.PM && task.project.createdBy !== userId) {
      throw forbidden('FORBIDDEN', 'You do not have permission to access this task');
    }

    if (role === Role.DEVELOPER && task.assignedTo !== userId) {
      throw forbidden('FORBIDDEN', 'You do not have permission to access this task');
    }

    return task;
  }

  async updateTask(userId: string, role: Role, taskId: string, dto: UpdateTaskDto) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
      },
    });

    if (!task) {
      throw notFound('NOT_FOUND', 'Task not found');
    }

    // Authorization & privilege restriction checks
    if (role === Role.DEVELOPER) {
      if (task.assignedTo !== userId) {
        throw forbidden('FORBIDDEN', 'You can only update tasks assigned to you');
      }

      // Developers are strictly forbidden from reassigning or altering ownership/meta fields
      if (dto.assignedTo && dto.assignedTo !== userId) {
        throw forbidden('FORBIDDEN', 'Developers are not permitted to reassign tasks');
      }

      if (dto.title !== undefined || dto.priority !== undefined || dto.dueDate !== undefined || dto.description !== undefined) {
        throw forbidden('FORBIDDEN', 'Developers can only update task status');
      }
    }

    if (role === Role.PM && task.project.createdBy !== userId) {
      throw forbidden('FORBIDDEN', 'You can only update tasks in projects you created');
    }

    // If assignedTo is being updated by Admin/PM, validate assignee role
    if (dto.assignedTo && dto.assignedTo !== task.assignedTo) {
      const assignee = await prisma.user.findUnique({
        where: { id: dto.assignedTo },
      });

      if (!assignee) {
        throw badRequest('VALIDATION_ERROR', 'Assigned user does not exist');
      }

      if (assignee.role !== Role.DEVELOPER) {
        throw badRequest('VALIDATION_ERROR', 'Task can only be assigned to a user with DEVELOPER role');
      }
    }

    const dueDate = dto.dueDate !== undefined ? (dto.dueDate ? new Date(dto.dueDate) : null) : task.dueDate;
    const newStatus = dto.status || task.status;
    const isOverdue = dueDate ? dueDate < new Date() && newStatus !== TaskStatus.DONE : false;

    const statusChanged = dto.status !== undefined && dto.status !== task.status;
    const fromStatus = task.status;
    const toStatus = dto.status;

    const assignmentChanged = dto.assignedTo !== undefined && dto.assignedTo !== task.assignedTo;
    const movedToInReview = task.status !== TaskStatus.IN_REVIEW && dto.status === TaskStatus.IN_REVIEW;

    const { updatedTask, activityRecord, createdNotifications } = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          ...(dto.title ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.assignedTo ? { assignedTo: dto.assignedTo } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.priority ? { priority: dto.priority } : {}),
          ...(dto.dueDate !== undefined ? { dueDate } : {}),
          isOverdue,
        },
        include: {
          assignee: { select: safeUserSelect },
          project: { select: { id: true, name: true, createdBy: true } },
        },
      });

      let createdLog = null;
      if (statusChanged && toStatus) {
        createdLog = await tx.activityLog.create({
          data: {
            taskId: task.id,
            projectId: task.projectId,
            userId: userId,
            changeDescription: `Task status changed from ${fromStatus} to ${toStatus}`,
            fromStatus: fromStatus,
            toStatus: toStatus,
            createdAt: new Date(),
          },
        });
      }

      const notifs: Array<{
        recipientId: string;
        notification: {
          id: string;
          type: string;
          message: string;
          relatedTaskId: string | null;
          isRead: boolean;
          createdAt: Date;
        };
      }> = [];

      // A. Assignment notification when assigned developer actually changes
      if (assignmentChanged && dto.assignedTo) {
        const notif = await tx.notification.create({
          data: {
            userId: dto.assignedTo,
            type: 'TASK_ASSIGNED',
            message: `You were assigned to task: "${updated.title}" in project "${task.project.name}"`,
            relatedTaskId: task.id,
          },
        });
        notifs.push({ recipientId: dto.assignedTo, notification: notif });
      }

      // B. In Review notification for PM when task moves to IN_REVIEW
      if (movedToInReview) {
        const pmUserId = task.project.createdBy;
        const notif = await tx.notification.create({
          data: {
            userId: pmUserId,
            type: 'TASK_IN_REVIEW',
            message: `Task "${updated.title}" was moved to IN_REVIEW`,
            relatedTaskId: task.id,
          },
        });
        notifs.push({ recipientId: pmUserId, notification: notif });
      }

      return { updatedTask: updated, activityRecord: createdLog, createdNotifications: notifs };
    });

    // ONLY AFTER SUCCESSFUL DATABASE COMMIT, emit real-time Socket.IO events
    if (createdNotifications.length > 0) {
      const io = getIO();
      if (io) {
        for (const item of createdNotifications) {
          emitNotificationNew(io, item.recipientId, {
            id: item.notification.id,
            type: item.notification.type,
            message: item.notification.message,
            relatedTaskId: item.notification.relatedTaskId,
            isRead: item.notification.isRead,
            createdAt: item.notification.createdAt.toISOString(),
          });

          const unreadCount = await prisma.notification.count({
            where: { userId: item.recipientId, isRead: false },
          });
          emitNotificationUnreadCount(io, item.recipientId, { unreadCount });
        }
      }
    }

    if (statusChanged && toStatus && activityRecord) {
      const io = getIO();
      if (io) {
        const updater = await prisma.user.findUnique({
          where: { id: userId },
          select: safeUserSelect,
        });

        if (updater) {
          emitTaskStatusChanged(io, {
            taskId: updatedTask.id,
            projectId: task.projectId,
            fromStatus,
            toStatus,
            changedBy: {
              id: updater.id,
              name: updater.name,
              role: updater.role,
            },
            changedAt: activityRecord.createdAt.toISOString(),
          });

          emitActivityNew(io, {
            id: activityRecord.id,
            taskId: updatedTask.id,
            projectId: task.projectId,
            userId: updater.id,
            user: {
              id: updater.id,
              name: updater.name,
              role: updater.role,
            },
            fromStatus,
            toStatus,
            description: activityRecord.changeDescription,
            createdAt: activityRecord.createdAt.toISOString(),
          });
        }
      }
    }

    return updatedTask;
  }

  async deleteTask(userId: string, role: Role, taskId: string) {
    if (role === Role.DEVELOPER) {
      throw forbidden('FORBIDDEN', 'Developers are not permitted to delete tasks');
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
      },
    });

    if (!task) {
      throw notFound('NOT_FOUND', 'Task not found');
    }

    if (role === Role.PM && task.project.createdBy !== userId) {
      throw forbidden('FORBIDDEN', 'You can only delete tasks in projects you created');
    }

    // Safely remove associated notification & activity records to prevent foreign key issues
    await prisma.notification.deleteMany({ where: { relatedTaskId: taskId } });
    await prisma.activityLog.deleteMany({ where: { taskId } });

    await prisma.task.delete({
      where: { id: taskId },
    });
  }
}

export const taskService = new TaskService();
