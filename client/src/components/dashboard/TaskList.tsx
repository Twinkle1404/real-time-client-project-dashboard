import React from 'react';
import { Project, Task, TaskFilters, TaskStatus, UserSummary } from '../../types/dashboard.types';
import { TaskFiltersBar } from './TaskFilters';
import { TaskRow } from './TaskRow';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';

interface TaskListProps {
  project: Project | null;
  tasks: Task[];
  currentUser: UserSummary;
  filters: TaskFilters;
  onFilterChange: (newFilters: TaskFilters) => void;
  onFilterReset: () => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  isLoading: boolean;
  updatingTaskId: string | null;
}

export const TaskList: React.FC<TaskListProps> = ({
  project,
  tasks,
  currentUser,
  filters,
  onFilterChange,
  onFilterReset,
  onStatusChange,
  isLoading,
  updatingTaskId,
}) => {
  if (!project) {
    return (
      <EmptyState
        title="Select a project"
        message="Please select a project from the left panel to view and manage its tasks."
      />
    );
  }

  const hasActiveFilters = Boolean(
    filters.status || filters.priority || filters.fromDate || filters.toDate
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Project Header Info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
            {project.name}
          </h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {project.client?.name ? `Client: ${project.client.name}` : 'Project Tasks'}
          </span>
        </div>

        <div style={{ fontSize: '13px', color: '#64748b' }}>
          Showing <strong>{tasks.length}</strong> task{tasks.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Query Parameter Filters Component */}
      <TaskFiltersBar
        filters={filters}
        onChange={onFilterChange}
        onReset={onFilterReset}
        isLoading={isLoading}
      />

      {/* Task List Content */}
      {isLoading ? (
        <LoadingSpinner message="Filtering tasks from database..." />
      ) : tasks.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? 'No tasks match the selected filters' : 'No tasks found'}
          message={
            hasActiveFilters
              ? 'Try clearing or modifying the status, priority, or date filters.'
              : 'There are no tasks currently created in this project.'
          }
          actionLabel={hasActiveFilters ? 'Clear Filters' : undefined}
          onAction={hasActiveFilters ? onFilterReset : undefined}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            overflowY: 'auto',
            maxHeight: '620px',
          }}
        >
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              currentUser={currentUser}
              onStatusChange={onStatusChange}
              isUpdating={updatingTaskId === task.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};
