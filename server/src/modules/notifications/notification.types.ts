export interface NotificationResponse {
  id: string;
  userId: string;
  type: string;
  message: string;
  relatedTaskId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
}
