import { Prisma, Role } from '@prisma/client';
import prisma from '../lib/prisma';
import { safeUserSelect } from '../lib/serializers';
import { isValidUuid } from '../modules/projects/project.validation';
import {
  ActivityCatchupPayload,
  ActivityCatchupResponse,
  ActivityNewPayload,
} from './realtime.types';

export class CatchupService {
  /**
   * Retrieves missed ActivityLog records for a reconnecting client from PostgreSQL.
   * Enforces server-side role authorization, cursor validation, a maximum of 20
   * records, and chronological ordering.
   */
  async getCatchupEvents(
    userId: string,
    role: Role,
    payload?: ActivityCatchupPayload
  ): Promise<ActivityCatchupResponse> {
    try {
      let cursorRecord = null;

      // 1. Validate cursor if provided
      if (payload?.lastSeenActivityId) {
        if (!isValidUuid(payload.lastSeenActivityId)) {
          return {
            success: false,
            error: {
              code: 'INVALID_CURSOR',
              message: 'ActivityLog cursor ID must be a valid UUID',
            },
          };
        }

        cursorRecord = await prisma.activityLog.findUnique({
          where: { id: payload.lastSeenActivityId },
        });

        if (!cursorRecord) {
          return {
            success: false,
            error: {
              code: 'INVALID_CURSOR',
              message: 'The provided lastSeenActivityId does not exist in the database',
            },
          };
        }
      }

      // 2. Resolve authorized project scope
      let authorizedProjectIds: string[] | null = null;

      if (payload?.projectId) {
        if (!isValidUuid(payload.projectId)) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Project ID must be a valid UUID',
            },
          };
        }

        const reqProjectId = payload.projectId;

        if (role === Role.ADMIN) {
          const project = await prisma.project.findUnique({
            where: { id: reqProjectId },
          });
          if (!project) {
            return {
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Requested project was not found',
              },
            };
          }
          authorizedProjectIds = [reqProjectId];
        } else if (role === Role.PM) {
          const project = await prisma.project.findFirst({
            where: { id: reqProjectId, createdBy: userId },
          });
          if (!project) {
            return {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You can only catch up on activity for projects you created',
              },
            };
          }
          authorizedProjectIds = [reqProjectId];
        } else if (role === Role.DEVELOPER) {
          const assigned = await prisma.task.findFirst({
            where: { projectId: reqProjectId, assignedTo: userId },
          });
          if (!assigned) {
            return {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You can only catch up on activity for projects where you have assigned tasks',
              },
            };
          }
          authorizedProjectIds = [reqProjectId];
        }
      } else {
        // No specific project requested: scope according to user's overall authorized projects
        if (role === Role.ADMIN) {
          authorizedProjectIds = null; // Admin can catch up across all projects globally
        } else if (role === Role.PM) {
          const pmProjects = await prisma.project.findMany({
            where: { createdBy: userId },
            select: { id: true },
          });
          authorizedProjectIds = pmProjects.map((p) => p.id);
          if (authorizedProjectIds.length === 0) {
            return {
              success: true,
              data: { events: [], count: 0, hasMore: false },
            };
          }
        } else if (role === Role.DEVELOPER) {
          const devTasks = await prisma.task.findMany({
            where: { assignedTo: userId },
            select: { projectId: true },
            distinct: ['projectId'],
          });
          authorizedProjectIds = devTasks.map((t) => t.projectId);
          if (authorizedProjectIds.length === 0) {
            return {
              success: true,
              data: { events: [], count: 0, hasMore: false },
            };
          }
        }
      }

      // Verify that the cursor record belongs to the user's authorized scope
      if (cursorRecord && authorizedProjectIds !== null) {
        if (!authorizedProjectIds.includes(cursorRecord.projectId)) {
          return {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You are not authorized to use a cursor from this project',
            },
          };
        }
      }

      // 3. Build database query filter with compound cursor logic
      const whereClause: Prisma.ActivityLogWhereInput = {};

      if (authorizedProjectIds !== null) {
        whereClause.projectId = { in: authorizedProjectIds };
      }

      if (cursorRecord) {
        // Compound cursor condition:
        // (createdAt > cursor.createdAt) OR (createdAt = cursor.createdAt AND id > cursor.id)
        whereClause.OR = [
          { createdAt: { gt: cursorRecord.createdAt } },
          {
            createdAt: cursorRecord.createdAt,
            id: { gt: cursorRecord.id },
          },
        ];
      }

      // 4. Query PostgreSQL with deterministic ordering and limit 21 to detect hasMore efficiently
      const records = await prisma.activityLog.findMany({
        where: whereClause,
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 21,
        include: {
          user: { select: safeUserSelect },
        },
      });

      const hasMore = records.length > 20;
      const latest20 = hasMore ? records.slice(0, 20) : records;

      // 5. Reverse latest20 into chronological order (oldest missed -> newest missed)
      // Since records were retrieved with [createdAt DESC, id DESC], reversing yields [createdAt ASC, id ASC]
      const chronological = latest20.reverse();

      const events: ActivityNewPayload[] = chronological.map((log) => ({
        id: log.id,
        taskId: log.taskId,
        projectId: log.projectId,
        userId: log.userId,
        user: {
          id: log.user.id,
          name: log.user.name,
          role: log.user.role,
        },
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        description: log.changeDescription,
        createdAt: log.createdAt.toISOString(),
      }));

      return {
        success: true,
        data: {
          events,
          count: events.length,
          hasMore,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve missed activity records from database',
        },
      };
    }
  }
}

export const catchupService = new CatchupService();
