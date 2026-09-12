import { Server } from 'socket.io';
import {
  TaskStatusChangedPayload,
  ActivityNewPayload,
  PresenceUpdatePayload,
  NotificationNewPayload,
  NotificationUnreadCountPayload,
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
} from './realtime.types';
import { presenceManager } from './presence';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, any, SocketData>;

/**
 * Emits task:statusChanged to project room.
 * Must be called ONLY after the database transaction has successfully committed.
 */
export const emitTaskStatusChanged = (
  io: TypedServer,
  payload: TaskStatusChangedPayload
): void => {
  io.to(`project:${payload.projectId}`).emit('task:statusChanged', payload);
};

/**
 * Emits activity:new to:
 * 1. The specific project room (for project members: PM and assigned Devs)
 * 2. The global:activity room (for Admins)
 * Must be called ONLY after ActivityLog record is persisted in PostgreSQL.
 */
export const emitActivityNew = (
  io: TypedServer,
  payload: ActivityNewPayload
): void => {
  io.to(`project:${payload.projectId}`).to('global:activity').emit('activity:new', payload);
};

/**
 * Broadcasts the current active online count to all connected authenticated clients.
 */
export const emitPresenceUpdate = (io: TypedServer): void => {
  const payload: PresenceUpdatePayload = {
    onlineCount: presenceManager.getOnlineCount(),
  };
  io.emit('presence:update', payload);
};

/**
 * Emits notification:new to the specific recipient's authenticated user room.
 * Must be called ONLY after the Notification record is persisted in PostgreSQL.
 */
export const emitNotificationNew = (
  io: TypedServer,
  userId: string,
  payload: NotificationNewPayload
): void => {
  io.to(`user:${userId}`).emit('notification:new', payload);
};

/**
 * Emits notification:unreadCount to the specific recipient's authenticated user room.
 * Represents the authoritative database unread count.
 */
export const emitNotificationUnreadCount = (
  io: TypedServer,
  userId: string,
  payload: NotificationUnreadCountPayload
): void => {
  io.to(`user:${userId}`).emit('notification:unreadCount', payload);
};
