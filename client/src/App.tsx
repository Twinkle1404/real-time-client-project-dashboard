import { useState, useEffect } from 'react';
import { User } from './types/auth.types';
import { authService } from './services/auth.service';
import { socketService } from './services/socket.service';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoadingSpinner } from './components/common/LoadingSpinner';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Attempt silent refresh on app load via HttpOnly cookie
  useEffect(() => {
    let isMounted = true;
    const initializeAuth = async () => {
      try {
        const token = await authService.refresh();
        const currentUser = await authService.getMe(token);
        if (isMounted) {
          setAccessToken(token);
          setUser(currentUser);
        }
      } catch {
        // Unauthenticated session, show login
        if (isMounted) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    initializeAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLoginSuccess = (loggedInUser: User, token: string) => {
    setUser(loggedInUser);
    setAccessToken(token);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore
    }
    socketService.disconnect();
    setUser(null);
    setAccessToken(null);
  };

  if (isInitializing) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <LoadingSpinner message="Checking authentication session..." size="lg" />
      </div>
    );
  }

  if (!user || !accessToken) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <DashboardPage
      user={user}
      accessToken={accessToken}
      onLogout={handleLogout}
    />
  );
}

export default App;
