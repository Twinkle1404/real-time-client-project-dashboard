import { Project } from '../types/dashboard.types';

const API_BASE = '/api/projects';

export class ProjectsService {
  async listProjects(accessToken: string): Promise<Project[]> {
    const res = await fetch(API_BASE, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to fetch projects');
    }

    return data.data.projects;
  }

  async getProject(accessToken: string, id: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to fetch project details');
    }

    return data.data.project;
  }
}

export const projectsService = new ProjectsService();
