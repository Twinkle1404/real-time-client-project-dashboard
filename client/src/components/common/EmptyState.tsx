import React from 'react';

interface EmptyStateProps {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No items found',
  message,
  actionLabel,
  onAction,
}) => {
  return (
    <div
      style={{
        padding: '36px 20px',
        textAlign: 'center',
        background: '#f8fafc',
        borderRadius: '8px',
        border: '1px dashed #cbd5e1',
        margin: '16px 0',
      }}
    >
      <div style={{ fontSize: '28px', marginBottom: '8px', color: '#94a3b8' }}>📂</div>
      <h4 style={{ margin: '0 0 6px 0', color: '#334155', fontSize: '15px' }}>{title}</h4>
      <p style={{ margin: '0 0 12px 0', color: '#64748b', fontSize: '13px' }}>{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
