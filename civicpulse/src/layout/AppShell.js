import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import PageSkeleton from '../components/ui/PageSkeleton';
import { SidebarProvider, useSidebar } from './SidebarContext';

function ShellFrame() {
  const { collapsed } = useSidebar();
  const location = useLocation();
  const flush = location.pathname.startsWith('/app/map');

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <Sidebar />

      <div
        className={`flex h-full min-w-0 flex-col transition-[padding] duration-200 ease-out ${
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-[248px]'
        }`}
      >
        <TopBar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            className={
              flush
                ? 'cp-page cp-page--flush h-full w-full min-w-0'
                : 'cp-page mx-auto h-full w-full min-w-0 max-w-[100%] px-3 py-3 sm:px-4 lg:px-4 lg:py-4'
            }
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { isAuthenticated, loading, mustChangePassword } = useAuth();
  const location = useLocation();

  // Asking the server who is signed in (a moment on first load).
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-4">
        <PageSkeleton variant="dashboard" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <SidebarProvider>
      <ShellFrame />
    </SidebarProvider>
  );
}
