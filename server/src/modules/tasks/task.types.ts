import { TaskStatus, TaskPriority } from '@prisma/client';
import { SafeUserOutput } from '../../lib/serializers';

export interface CreateTaskDto {
  title: string;
  description?: string;
  assignedTo: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  assignedTo?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
}

export interface TaskOutput {
  id: string;
  projectId: string;
  assignedTo: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  isOverdue: boolean;
  createdAt: Date;
  assignee?: SafeUserOutput;
  project?: {
    id: string;
    name: string;
    createdBy: string;
  };
}

export interface TaskFilterQuery {
  status?: string;
  priority?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ParsedTaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  fromDate?: Date;
  toDate?: Date;
}
