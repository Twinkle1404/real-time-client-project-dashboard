import React, { useState } from 'react';
import { authService } from '../services/auth.service';
import { User } from '../types/auth.types';
import { ErrorBanner } from '../components/common/ErrorBanner';

interface LoginPageProps {
  onLoginSuccess: (user: User, accessToken: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('admin@velozity.com');
  const [password, setPassword] = useState('DevPassword123!');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = await authService.login({ email, password });
      onLoginSuccess(data.user, data.accessToken);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const setQuickUser = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('DevPassword123!');
    setError(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e2e8f0',
          padding: '32px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: 'white',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '24px',
              marginBottom: '12px',
            }}
          >
            V
          </div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>
            Velozity Global Solutions
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            Sign in to access your role-specific dashboard
          </p>
        </div>

        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#334155', marginBottom: '6px' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#334155', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '11px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
              marginTop: '4px',
            }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Quick-Switch Personas for Demonstration */}
        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Quick Select Seed Personas
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setQuickUser('admin@velozity.com')}
              style={quickBtnStyle('#f3e8ff', '#7e22ce')}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => setQuickUser('pm1@velozity.com')}
              style={quickBtnStyle('#eff6ff', '#1d4ed8')}
            >
              PM 1 (Alice)
            </button>
            <button
              type="button"
              onClick={() => setQuickUser('pm2@velozity.com')}
              style={quickBtnStyle('#eff6ff', '#1d4ed8')}
            >
              PM 2 (Bob)
            </button>
            <button
              type="button"
              onClick={() => setQuickUser('dev1@velozity.com')}
              style={quickBtnStyle('#ecfdf5', '#047857')}
            >
              Dev 1 (Charlie)
            </button>
            <button
              type="button"
              onClick={() => setQuickUser('dev2@velozity.com')}
              style={quickBtnStyle('#ecfdf5', '#047857')}
            >
              Dev 2 (Diana)
            </button>
            <button
              type="button"
              onClick={() => setQuickUser('dev3@velozity.com')}
              style={quickBtnStyle('#ecfdf5', '#047857')}
            >
              Dev 3 (Evan)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const quickBtnStyle = (bg: string, color: string): React.CSSProperties => ({
  padding: '6px 10px',
  fontSize: '12px',
  fontWeight: 500,
  backgroundColor: bg,
  color: color,
  border: '1px solid transparent',
  borderRadius: '6px',
  cursor: 'pointer',
  textAlign: 'center',
});
