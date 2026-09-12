export type Role = 'ADMIN' | 'PM' | 'DEVELOPER';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ClientSummary {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  createdBy: string;
  createdAt: string;
  client?: ClientSummary;
  creator?: UserSummary;
  tasks?: Task[];
  _count?: {
    tasks: number;
  };
}

export interface Task {
  id: string;
  projectId: string;
  assignedTo: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  isOverdue: boolean;
  createdAt: string;
  assignee?: UserSummary;
  project?: {
    id: string;
    name: string;
    createdBy: string;
  };
}

export interface TaskFilters {
  status?: TaskStatus | '';
  priority?: TaskPriority | '';
  fromDate?: string;
  toDate?: string;
}

export interface NotificationItem {
  id: string;
  userId?: string;
  type: string;
  message: string;
  relatedTaskId?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  taskId: string;
  projectId: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    role: Role;
  };
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  description: string;
  createdAt: string;
}
