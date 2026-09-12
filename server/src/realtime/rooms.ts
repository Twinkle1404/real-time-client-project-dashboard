import { Socket } from 'socket.io';
import { Role } from '@prisma/client';
import prisma from '../lib/prisma';
import { isValidUuid } from '../modules/projects/project.validation';
import { SocketData, JoinProjectPayload, RoomAckResponse } from './realtime.types';

/**
 * Handles client request to join a project room: project:<projectId>.
 * Strictly authorizes access via database lookup based on authenticated socket user.
 */
export const handleJoinProject = async (
  socket: Socket<any, any, any, SocketData>,
  payload: JoinProjectPayload,
  callback?: (response: RoomAckResponse) => void
): Promise<void> => {
  const user = socket.data.user;
  if (!user) {
    callback?.({ success: false, error: 'Unauthorized: Socket not authenticated' });
    return;
  }

  const projectId = payload?.projectId;
  if (!projectId || typeof projectId !== 'string' || !isValidUuid(projectId)) {
    callback?.({ success: false, error: 'Invalid project ID format' });
    return;
  }

  try {
    if (user.role === Role.ADMIN) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });
      if (!project) {
        callback?.({ success: false, error: 'Project not found' });
        return;
      }
      socket.join(`project:${projectId}`);
      callback?.({ success: true });
      return;
    }

    if (user.role === Role.PM) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, createdBy: user.userId },
      });
      if (!project) {
        callback?.({
          success: false,
          error: 'Forbidden: You can only join project rooms for projects you created',
        });
        return;
      }
      socket.join(`project:${projectId}`);
      callback?.({ success: true });
      return;
    }

    if (user.role === Role.DEVELOPER) {
      const assignedTask = await prisma.task.findFirst({
        where: { projectId, assignedTo: user.userId },
      });
      if (!assignedTask) {
        callback?.({
          success: false,
          error: 'Forbidden: You can only join project rooms where you have assigned tasks',
        });
        return;
      }
      socket.join(`project:${projectId}`);
      callback?.({ success: true });
      return;
    }

    callback?.({ success: false, error: 'Forbidden: Role not recognized' });
  } catch (error) {
    callback?.({ success: false, error: 'Internal server error while joining room' });
  }
};

/**
 * Handles client request to leave a project room.
 */
export const handleLeaveProject = (
  socket: Socket<any, any, any, SocketData>,
  payload: JoinProjectPayload,
  callback?: (response: RoomAckResponse) => void
): void => {
  const projectId = payload?.projectId;
  if (projectId) {
    socket.leave(`project:${projectId}`);
  }
  callback?.({ success: true });
};

/**
 * Handles client request to join the global:activity room.
 * Strictly restricted to ADMIN role.
 */
export const handleJoinGlobalActivity = (
  socket: Socket<any, any, any, SocketData>,
  callback?: (response: RoomAckResponse) => void
): void => {
  const user = socket.data.user;
  if (!user || user.role !== Role.ADMIN) {
    callback?.({
      success: false,
      error: 'Forbidden: Only administrators are authorized to join global activity stream',
    });
    return;
  }

  socket.join('global:activity');
  callback?.({ success: true });
};

/**
 * Handles client request to leave the global:activity room.
 */
export const handleLeaveGlobalActivity = (
  socket: Socket<any, any, any, SocketData>,
  callback?: (response: RoomAckResponse) => void
): void => {
  socket.leave('global:activity');
  callback?.({ success: true });
};
