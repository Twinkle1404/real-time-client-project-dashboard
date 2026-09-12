export type Role = 'ADMIN' | 'PM' | 'DEVELOPER';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

export interface TaskStatusChangedPayload {
  taskId: string;
  projectId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  changedBy: {
    id: string;
    name: string;
    role: Role;
  };
  changedAt: string;
}

export interface ActivityNewPayload {
  id: string;
  taskId: string;
  projectId: string;
  userId: string;
  user: {
    id: string;
    name: string;
    role: Role;
  };
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  description: string;
  createdAt: string;
}

export interface PresenceUpdatePayload {
  onlineCount: number;
}

export interface RoomAckResponse {
  success: boolean;
  error?: string;
}

export interface ActivityCatchupPayload {
  lastSeenActivityId?: string;
  projectId?: string;
}

export interface ActivityCatchupData {
  events: ActivityNewPayload[];
  count: number;
  hasMore: boolean;
}

export type ActivityCatchupResponse =
  | { success: true; data: ActivityCatchupData }
  | { success: false; error: { code: string; message: string } };

export interface NotificationNewPayload {
  id: string;
  type: string;
  message: string;
  relatedTaskId?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationUnreadCountPayload {
  unreadCount: number;
}
