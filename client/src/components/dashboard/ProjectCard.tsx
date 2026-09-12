import React from 'react';
import { Project } from '../../types/dashboard.types';

interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  onSelect: (project: Project) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isSelected,
  onSelect,
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Select project ${project.name}`}
      onClick={() => onSelect(project)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(project);
        }
      }}
      style={{
        padding: '14px 16px',
        borderRadius: '8px',
        border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
        backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
        cursor: 'pointer',
        transition: 'all 0.15s ease-in-out',
        outline: 'none',
        boxShadow: isSelected
          ? '0 4px 6px -1px rgba(37, 99, 235, 0.1)'
          : '0 1px 2px rgba(0, 0, 0, 0.04)',
      }}
      onFocus={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = '#93c5fd';
      }}
      onBlur={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = '#e2e8f0';
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = '#cbd5e1';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = '#e2e8f0';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>
          {project.name}
        </h4>
        {isSelected && (
          <span
            style={{
              fontSize: '11px',
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            Active
          </span>
        )}
      </div>

      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
        {project.client?.name && (
          <span>Client: <strong style={{ color: '#475569' }}>{project.client.name}</strong></span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '10px',
          fontSize: '11px',
          color: '#94a3b8',
        }}
      >
        <span>
          Created: {new Date(project.createdAt).toLocaleDateString()}
        </span>
        {project._count?.tasks !== undefined && (
          <span
            style={{
              backgroundColor: '#f1f5f9',
              padding: '2px 6px',
              borderRadius: '4px',
              color: '#475569',
              fontWeight: 500,
            }}
          >
            {project._count.tasks} task{project._count.tasks === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
};
