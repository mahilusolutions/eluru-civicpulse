import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RoleGuard from './components/RoleGuard';
import { RouteSkeleton } from './components/ui/PageSkeleton';
import AppShell from './layout/AppShell';
import LandingPage from './pages/LandingPage';
import { ThemeProvider } from './theme/ThemeContext';
import lazyPage from './utils/lazyPage';

// The landing page loads with the app so it shows at once; every other page downloads only when opened.
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'));
const VotersPage = lazyPage(() => import('./pages/VotersPage'));
const BoothsPage = lazyPage(() => import('./pages/BoothsPage'));
const WardsPage = lazyPage(() => import('./pages/WardsPage'));
const HouseholdsPage = lazyPage(() => import('./pages/HouseholdsPage'));
const OutreachPage = lazyPage(() => import('./pages/OutreachPage'));
const IssuesPage = lazyPage(() => import('./pages/IssuesPage'));
const SurveyPage = lazyPage(() => import('./pages/SurveyPage'));
const ElectionDayPage = lazyPage(() => import('./pages/ElectionDayPage'));
const MapPage = lazyPage(() => import('./pages/MapPage'));
const TeamPage = lazyPage(() => import('./pages/TeamPage'));
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'));
const DataPage = lazyPage(() => import('./pages/DataPage'));
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'));

function guarded(path, element) {
  return (
    <RoleGuard path={path}>
      <Suspense fallback={<RouteSkeleton />}>{element}</Suspense>
    </RoleGuard>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={guarded('/app/dashboard', <DashboardPage />)} />
              <Route path="voters" element={guarded('/app/voters', <VotersPage />)} />
              <Route path="booths" element={guarded('/app/booths', <BoothsPage />)} />
              <Route path="wards" element={guarded('/app/wards', <WardsPage />)} />
              <Route path="households" element={guarded('/app/households', <HouseholdsPage />)} />
              <Route path="outreach" element={guarded('/app/outreach', <OutreachPage />)} />
              <Route path="issues" element={guarded('/app/issues', <IssuesPage />)} />
              <Route path="survey" element={guarded('/app/survey', <SurveyPage />)} />
              <Route path="election-day" element={guarded('/app/election-day', <ElectionDayPage />)} />
              <Route path="map" element={guarded('/app/map', <MapPage />)} />
              <Route path="team" element={guarded('/app/team', <TeamPage />)} />
              <Route path="reports" element={guarded('/app/reports', <ReportsPage />)} />
              <Route path="data" element={guarded('/app/data', <DataPage />)} />
              <Route path="settings" element={guarded('/app/settings', <SettingsPage />)} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
