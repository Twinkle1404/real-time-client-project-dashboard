import React from 'react';
import { NotificationItem } from '../../types/dashboard.types';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface NotificationPanelProps {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  notifications,
  unreadCount,
  isLoading,
  onMarkAsRead,
  onMarkAllAsRead,
  onClose,
}) => {
  return (
    <div
      role="region"
      aria-label="Notifications panel"
      style={{
        position: 'absolute',
        top: '70px',
        right: '24px',
        width: '380px',
        maxWidth: 'calc(100vw - 48px)',
        backgroundColor: '#ffffff',
        borderRadius: '10px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e2e8f0',
        zIndex: 1000,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h4 style={{ margin: 0, fontSize: '15px', color: '#0f172a', fontWeight: 600 }}>
            Notifications
          </h4>
          {unreadCount > 0 && (
            <span
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '1px 6px',
                borderRadius: '10px',
              }}
            >
              {unreadCount} unread
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              style={{
                fontSize: '12px',
                color: '#2563eb',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
                padding: 0,
              }}
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close notifications"
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '16px',
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '8px' }}>
        {isLoading ? (
          <LoadingSpinner message="Loading notifications..." size="sm" />
        ) : notifications.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No notifications yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: n.isRead ? '#ffffff' : '#eff6ff',
                  border: n.isRead ? '1px solid #f1f5f9' : '1px solid #bfdbfe',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: n.type === 'TASK_ASSIGNED' ? '#2563eb' : '#059669',
                      marginBottom: '2px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {n.type === 'TASK_ASSIGNED' ? 'Task Assignment' : 'Review Ready'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#1e293b', lineHeight: '1.4' }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    {new Date(n.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                {!n.isRead && (
                  <button
                    onClick={() => onMarkAsRead(n.id)}
                    style={{
                      fontSize: '11px',
                      color: '#2563eb',
                      backgroundColor: '#ffffff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '4px',
                      padding: '3px 6px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    title="Mark as read"
                  >
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
