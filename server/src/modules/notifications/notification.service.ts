import prisma from '../../lib/prisma';
import { forbidden, notFound } from '../../lib/errors';
import { NotificationResponse } from './notification.types';
import { getIO } from '../../realtime/socket';
import { emitNotificationUnreadCount } from '../../realtime/events';

export class NotificationService {
  /**
   * Retrieves notifications scoped strictly to the authenticated user, ordered newest first.
   */
  async listNotifications(
    userId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ notifications: NotificationResponse[]; totalCount: number; unreadCount: number }> {
    const skip = (page - 1) * limit;

    const [records, totalCount, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({
        where: { userId },
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    const notifications: NotificationResponse[] = records.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      message: n.message,
      relatedTaskId: n.relatedTaskId,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));

    return { notifications, totalCount, unreadCount };
  }

  /**
   * Retrieves the unread notification count directly from PostgreSQL for the authenticated user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Marks a specific notification as read.
   * Enforces strict user ownership (rejects cross-user IDOR with 403 FORBIDDEN).
   * Idempotent: marking an already-read notification returns successfully without redundant side effects.
   */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationResponse> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw notFound('NOT_FOUND', 'Notification not found');
    }

    // IDOR Protection: verify notification belongs to authenticated user
    if (notification.userId !== userId) {
      throw forbidden('FORBIDDEN', 'You are not authorized to update this notification');
    }

    if (notification.isRead) {
      return {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        message: notification.message,
        relatedTaskId: notification.relatedTaskId,
        isRead: notification.isRead,
        createdAt: notification.createdAt.toISOString(),
      };
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    // Query authoritative unread count directly from PostgreSQL
    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    // Emit updated unread count to recipient's Socket.IO room
    const io = getIO();
    if (io) {
      emitNotificationUnreadCount(io, userId, { unreadCount });
    }

    return {
      id: updated.id,
      userId: updated.userId,
      type: updated.type,
      message: updated.message,
      relatedTaskId: updated.relatedTaskId,
      isRead: updated.isRead,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Marks all unread notifications belonging to the authenticated user as read.
   * Uses a single database-level updateMany.
   */
  async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    // Emit authoritative unread count (0) to recipient's Socket.IO room
    const io = getIO();
    if (io) {
      emitNotificationUnreadCount(io, userId, { unreadCount: 0 });
    }

    return { updatedCount: result.count };
  }
}

export const notificationService = new NotificationService();
