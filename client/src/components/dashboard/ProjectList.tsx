import React from 'react';
import { Project } from '../../types/dashboard.types';
import { ProjectCard } from './ProjectCard';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';

interface ProjectListProps {
  projects: Project[];
  selectedProjectId: string | null;
  isLoading: boolean;
  onSelectProject: (project: Project) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  selectedProjectId,
  isLoading,
  onSelectProject,
}) => {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          paddingBottom: '10px',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
          Projects ({projects.length})
        </h3>
      </div>

      {isLoading ? (
        <LoadingSpinner message="Loading projects..." size="sm" />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects available"
          message="There are no projects assigned or accessible for your account."
        />
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            overflowY: 'auto',
            maxHeight: '650px',
          }}
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isSelected={project.id === selectedProjectId}
              onSelect={onSelectProject}
            />
          ))}
        </div>
      )}
    </div>
  );
};
