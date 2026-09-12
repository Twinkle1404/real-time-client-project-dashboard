import React from 'react';

interface ErrorBannerProps {
  error: string | null;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ error, onDismiss }) => {
  if (!error) return null;

  const isForbidden = error.toLowerCase().includes('forbidden') || error.includes('403');
  const isNotFound = error.toLowerCase().includes('not found') || error.includes('404');
  const isAuth = error.toLowerCase().includes('unauthorized') || error.includes('401');

  const bgColor = isForbidden ? '#fef2f2' : isAuth ? '#fffbeb' : '#fef2f2';
  const borderColor = isForbidden ? '#f87171' : isAuth ? '#fde68a' : '#fca5a5';
  const textColor = isForbidden ? '#991b1b' : isAuth ? '#92400e' : '#991b1b';

  return (
    <div
      style={{
        padding: '12px 16px',
        margin: '12px 0',
        borderRadius: '6px',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        color: textColor,
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>{isForbidden ? '⛔' : isNotFound ? '🔍' : isAuth ? '🔒' : '⚠️'}</span>
        <span>
          {isForbidden
            ? `Access Denied (403 Forbidden): ${error}`
            : isNotFound
            ? `Not Found (404): ${error}`
            : isAuth
            ? `Session Expired (401): ${error}`
            : error}
        </span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: textColor,
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
          }}
          title="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
};
