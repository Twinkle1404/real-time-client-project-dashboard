import React from 'react';
import { UserSummary } from '../../types/dashboard.types';

interface DashboardHeaderProps {
  user: UserSummary;
  onlineCount: number;
  unreadCount: number;
  showNotifications: boolean;
  onToggleNotifications: () => void;
  onLogout: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  user,
  onlineCount,
  unreadCount,
  showNotifications,
  onToggleNotifications,
  onLogout,
}) => {
  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return { background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe' };
      case 'PM':
        return { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' };
      case 'DEVELOPER':
        return { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
      default:
        return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' };
    }
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        padding: '16px 28px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '18px',
            }}
          >
            V
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              Velozity Global Solutions
            </h1>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Real-Time Client Project Dashboard
            </span>
          </div>
        </div>

        <span
          style={{
            ...getRoleBadgeStyle(user.role),
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          {user.role === 'PM' ? 'PROJECT MANAGER' : user.role} DASHBOARD
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {/* Real-time online presence indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#334155',
            backgroundColor: '#f8fafc',
            padding: '6px 12px',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
          }}
          title="Online users across all active connections"
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#22c55e',
              display: 'inline-block',
              boxShadow: '0 0 6px #22c55e',
            }}
          />
          <span>
            Online: <strong>{onlineCount}</strong>
          </span>
        </div>

        {/* Notifications toggle button with live unread badge */}
        <button
          onClick={onToggleNotifications}
          style={{
            position: 'relative',
            background: showNotifications ? '#eff6ff' : 'transparent',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#334155',
          }}
          aria-label="Notifications"
        >
          <span>🔔</span>
          {unreadCount > 0 && (
            <span
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '1px 6px',
                borderRadius: '10px',
                minWidth: '16px',
                textAlign: 'center',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* User Profile info */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
            {user.name}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>{user.email}</div>
        </div>

        {/* Logout button */}
        <button
          onClick={onLogout}
          style={{
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 500,
            color: '#475569',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
        >
          Logout
        </button>
      </div>
    </header>
  );
};
