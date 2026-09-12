import React from 'react';
import { ActivityItem, formatTaskStatusLabel } from '../../types/dashboard.types';

interface ActivityFeedProps {
  activities: ActivityItem[];
  title?: string;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  title = 'Live Activity Feed',
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
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
          {title} ({activities.length})
        </h3>
        <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} /> Live
        </span>
      </div>

      {activities.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          No recent activity logs recorded yet.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            overflowY: 'auto',
            maxHeight: '300px',
          }}
        >
          {activities.map((act) => (
            <div
              key={act.id}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: '#f8fafc',
                border: '1px solid #f1f5f9',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>
                  {act.user?.name || 'User'}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                  {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <div style={{ color: '#64748b' }}>
                {act.fromStatus && act.toStatus ? (
                  <span>
                    Status changed: <code style={{ backgroundColor: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>{formatTaskStatusLabel(act.fromStatus)}</code> →{' '}
                    <code style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>
                      {formatTaskStatusLabel(act.toStatus)}
                    </code>
                  </span>
                ) : (
                  <span>{act.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
