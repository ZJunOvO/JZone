import React from 'react';
import { AppProvider } from './store';
import { AuthProvider, useAuth } from './auth';
import { Auth } from './pages/Auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BUILD_ID } from './buildInfo';
import { AppShell } from './components/layout/AppShell';
import { FeedbackProvider } from './components/feedback';

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-zinc-500 text-sm font-bold tracking-widest uppercase">Loading</div>
      </div>
    );
  }

  if (status === 'signed_out' || status === 'misconfigured') {
    return <Auth />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  try {
    document.documentElement.dataset.buildId = BUILD_ID;
  } catch {}

  return (
    <FeedbackProvider>
      <AuthProvider>
        <AppProvider>
          <ErrorBoundary>
            <AuthGate>
              <AppShell />
            </AuthGate>
          </ErrorBoundary>
        </AppProvider>
      </AuthProvider>
    </FeedbackProvider>
  );
};

export default App;
