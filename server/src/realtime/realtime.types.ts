import { Role, TaskStatus } from '@prisma/client';

export interface SocketUser {
  userId: string;
  role: Role;
}

export interface SocketData {
  user: SocketUser;
}

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

export interface JoinProjectPayload {
  projectId: string;
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

export interface ServerToClientEvents {
  'task:statusChanged': (payload: TaskStatusChangedPayload) => void;
  'activity:new': (payload: ActivityNewPayload) => void;
  'presence:update': (payload: PresenceUpdatePayload) => void;
  'activity:catchup:result': (data: ActivityCatchupData) => void;
  'notification:new': (payload: NotificationNewPayload) => void;
  'notification:unreadCount': (payload: NotificationUnreadCountPayload) => void;
}

export interface ClientToServerEvents {
  'project:join': (payload: JoinProjectPayload, callback?: (response: RoomAckResponse) => void) => void;
  'project:leave': (payload: JoinProjectPayload, callback?: (response: RoomAckResponse) => void) => void;
  'global:join': (callback?: (response: RoomAckResponse) => void) => void;
  'global:leave': (callback?: (response: RoomAckResponse) => void) => void;
  'activity:catchup': (payload: ActivityCatchupPayload, callback?: (response: ActivityCatchupResponse) => void) => void;
}
