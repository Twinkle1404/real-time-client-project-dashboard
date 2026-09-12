import React from 'react';
import { Task, TaskPriority, TaskStatus, UserSummary } from '../../types/dashboard.types';

interface TaskRowProps {
  task: Task;
  currentUser: UserSummary;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  isUpdating: boolean;
}

export const TaskRow: React.FC<TaskRowProps> = ({
  task,
  currentUser,
  onStatusChange,
  isUpdating,
}) => {
  const getPriorityBadgeStyle = (priority: TaskPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return { background: '#fef2f2', color: '#991b1b', border: '1px solid #f87171' };
      case 'HIGH':
        return { background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' };
      case 'MEDIUM':
        return { background: '#fefce8', color: '#854d0e', border: '1px solid #fde047' };
      case 'LOW':
        return { background: '#f0fdf4', color: '#166534', border: '1px solid #86efac' };
      default:
        return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' };
    }
  };

  const getStatusBadgeStyle = (status: TaskStatus) => {
    switch (status) {
      case 'DONE':
        return { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
      case 'IN_REVIEW':
        return { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' };
      case 'IN_PROGRESS':
        return { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' };
      case 'TODO':
      default:
        return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' };
    }
  };

  // Determine if current user can update status
  const canUpdateStatus =
    currentUser.role === 'ADMIN' ||
    currentUser.role === 'PM' ||
    (currentUser.role === 'DEVELOPER' && task.assignedTo === currentUser.id);

  return (
    <div
      style={{
        padding: '14px 18px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>
              {task.title}
            </h4>

            {/* Priority badge */}
            <span
              style={{
                ...getPriorityBadgeStyle(task.priority),
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              {task.priority}
            </span>

            {/* Authoritative PostgreSQL-persisted Overdue Indicator */}
            {task.isOverdue && (
              <span
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Overdue detected by scheduled background processor"
              >
                ⚠️ OVERDUE
              </span>
            )}
          </div>

          {task.description && (
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              {task.description}
            </p>
          )}
        </div>

        {/* Status selector / badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canUpdateStatus ? (
            <select
              aria-label={`Change status for ${task.title}`}
              value={task.status}
              onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
              disabled={isUpdating}
              style={{
                ...getStatusBadgeStyle(task.status),
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <option value="TODO">TODO</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="DONE">DONE</option>
            </select>
          ) : (
            <span
              style={{
                ...getStatusBadgeStyle(task.status),
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {task.status}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '6px',
          paddingTop: '8px',
          borderTop: '1px solid #f8fafc',
          fontSize: '12px',
          color: '#64748b',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>
            Assignee: <strong style={{ color: '#334155' }}>{task.assignee?.name || 'Unassigned'}</strong>
          </span>
          {task.dueDate && (
            <span>
              Due: <strong style={{ color: task.isOverdue ? '#dc2626' : '#334155' }}>
                {new Date(task.dueDate).toLocaleDateString()}
              </strong>
            </span>
          )}
        </div>

        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          Created: {new Date(task.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
};
