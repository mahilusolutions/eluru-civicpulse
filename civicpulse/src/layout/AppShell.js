import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import { SidebarProvider, useSidebar } from './SidebarContext';

function ShellFrame() {
  const { collapsed } = useSidebar();

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <Sidebar />

      {/* Offset equals fixed sidebar width so main fills the rest */}
      <div
        className={`flex h-full min-w-0 flex-col transition-[padding] duration-200 ease-out ${
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-[248px]'
        }`}
      >
        <TopBar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto h-full w-full min-w-0 max-w-[100%] px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-5">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <SidebarProvider>
      <ShellFrame />
    </SidebarProvider>
  );
}
