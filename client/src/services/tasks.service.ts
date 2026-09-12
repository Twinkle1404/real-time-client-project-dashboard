import { Task, TaskFilters, TaskStatus } from '../types/dashboard.types';

export class TasksService {
  async listTasks(
    accessToken: string,
    projectId: string,
    filters?: TaskFilters
  ): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.status) {
      params.append('status', filters.status);
    }
    if (filters?.priority) {
      params.append('priority', filters.priority);
    }
    if (filters?.fromDate) {
      params.append('fromDate', filters.fromDate);
    }
    if (filters?.toDate) {
      params.append('toDate', filters.toDate);
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/projects/${projectId}/tasks${queryString}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to fetch tasks');
    }

    return data.data.tasks;
  }

  async updateTaskStatus(
    accessToken: string,
    taskId: string,
    status: TaskStatus
  ): Promise<Task> {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to update task status');
    }

    return data.data.task;
  }
}

export const tasksService = new TasksService();
