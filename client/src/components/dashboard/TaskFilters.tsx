import React from 'react';
import { TaskFilters, TaskPriority, TaskStatus } from '../../types/dashboard.types';

interface TaskFiltersProps {
  filters: TaskFilters;
  onChange: (newFilters: TaskFilters) => void;
  onReset: () => void;
  isLoading: boolean;
}

export const TaskFiltersBar: React.FC<TaskFiltersProps> = ({
  filters,
  onChange,
  onReset,
  isLoading,
}) => {
  const hasActiveFilters = Boolean(
    filters.status || filters.priority || filters.fromDate || filters.toDate
  );

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        padding: '14px 18px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        marginBottom: '16px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px' }}>
        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="task-status-filter" style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>
            Status:
          </label>
          <select
            id="task-status-filter"
            aria-label="Filter tasks by status"
            value={filters.status || ''}
            onChange={(e) =>
              onChange({ ...filters, status: (e.target.value as TaskStatus) || '' })
            }
            disabled={isLoading}
            style={{
              padding: '6px 10px',
              fontSize: '13px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#1e293b',
              cursor: 'pointer',
            }}
          >
            <option value="">All Statuses</option>
            <option value="TODO">TODO</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="IN_REVIEW">IN_REVIEW</option>
            <option value="DONE">DONE</option>
          </select>
        </div>

        {/* Priority Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="task-priority-filter" style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>
            Priority:
          </label>
          <select
            id="task-priority-filter"
            aria-label="Filter tasks by priority"
            value={filters.priority || ''}
            onChange={(e) =>
              onChange({ ...filters, priority: (e.target.value as TaskPriority) || '' })
            }
            disabled={isLoading}
            style={{
              padding: '6px 10px',
              fontSize: '13px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#1e293b',
              cursor: 'pointer',
            }}
          >
            <option value="">All Priorities</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>

        {/* Date Range: From */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="task-fromdate-filter" style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>
            From:
          </label>
          <input
            id="task-fromdate-filter"
            aria-label="Filter tasks due from date"
            type="date"
            value={filters.fromDate || ''}
            onChange={(e) => onChange({ ...filters, fromDate: e.target.value })}
            disabled={isLoading}
            style={{
              padding: '5px 8px',
              fontSize: '13px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#1e293b',
            }}
          />
        </div>

        {/* Date Range: To */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="task-todate-filter" style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>
            To:
          </label>
          <input
            id="task-todate-filter"
            aria-label="Filter tasks due to date"
            type="date"
            value={filters.toDate || ''}
            onChange={(e) => onChange({ ...filters, toDate: e.target.value })}
            disabled={isLoading}
            style={{
              padding: '5px 8px',
              fontSize: '13px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#1e293b',
            }}
          />
        </div>
      </div>

      {/* Reset Button */}
      {hasActiveFilters && (
        <button
          onClick={onReset}
          disabled={isLoading}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 500,
            borderRadius: '6px',
            border: '1px solid #fca5a5',
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>✕</span> Clear Filters
        </button>
      )}
    </div>
  );
};
