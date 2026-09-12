import { NotificationItem } from '../types/dashboard.types';

const API_BASE = '/api/notifications';

export class NotificationsService {
  async listNotifications(
    accessToken: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ notifications: NotificationItem[]; pagination: any }> {
    const res = await fetch(`${API_BASE}?page=${page}&limit=${limit}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to fetch notifications');
    }

    return data.data;
  }

  async getUnreadCount(accessToken: string): Promise<number> {
    const res = await fetch(`${API_BASE}/unread-count`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to fetch unread count');
    }

    return data.data.unreadCount;
  }

  async markAsRead(accessToken: string, id: string): Promise<NotificationItem> {
    const res = await fetch(`${API_BASE}/${id}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to mark notification as read');
    }

    return data.data.notification;
  }

  async markAllAsRead(accessToken: string): Promise<number> {
    const res = await fetch(`${API_BASE}/read-all`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to mark all notifications as read');
    }

    return data.data.updatedCount;
  }
}

export const notificationsService = new NotificationsService();
