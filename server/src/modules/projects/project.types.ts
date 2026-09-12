import { SafeUserOutput } from '../../lib/serializers';

export interface CreateProjectDto {
  name: string;
  clientId: string;
}

export interface UpdateProjectDto {
  name?: string;
  clientId?: string;
}

export interface ProjectOutput {
  id: string;
  name: string;
  clientId: string;
  createdBy: string;
  createdAt: Date;
  client?: {
    id: string;
    name: string;
    createdAt: Date;
  };
  creator?: SafeUserOutput;
  _count?: {
    tasks: number;
  };
}
