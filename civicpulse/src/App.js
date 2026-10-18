import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RoleGuard from './components/RoleGuard';
import AppShell from './layout/AppShell';
import LandingPage from './pages/LandingPage';
import { ThemeProvider } from './theme/ThemeContext';
import {
  BoothsPage,
  DashboardPage,
  DataPage,
  ElectionDayPage,
  HouseholdsPage,
  IssuesPage,
  MapPage,
  OutreachPage,
  ReportsPage,
  SettingsPage,
  SurveyPage,
  TeamPage,
  VotersPage,
  WardsPage,
} from './pages/modulePages';

function guarded(path, element) {
  return <RoleGuard path={path}>{element}</RoleGuard>;
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
              <Route
                path="dashboard"
                element={guarded('/app/dashboard', <DashboardPage />)}
              />
              <Route path="voters" element={guarded('/app/voters', <VotersPage />)} />
              <Route path="booths" element={guarded('/app/booths', <BoothsPage />)} />
              <Route path="wards" element={guarded('/app/wards', <WardsPage />)} />
              <Route
                path="households"
                element={guarded('/app/households', <HouseholdsPage />)}
              />
              <Route
                path="outreach"
                element={guarded('/app/outreach', <OutreachPage />)}
              />
              <Route path="issues" element={guarded('/app/issues', <IssuesPage />)} />
              <Route path="survey" element={guarded('/app/survey', <SurveyPage />)} />
              <Route
                path="election-day"
                element={guarded('/app/election-day', <ElectionDayPage />)}
              />
              <Route path="map" element={guarded('/app/map', <MapPage />)} />
              <Route path="team" element={guarded('/app/team', <TeamPage />)} />
              <Route path="reports" element={guarded('/app/reports', <ReportsPage />)} />
              <Route path="data" element={guarded('/app/data', <DataPage />)} />
              <Route
                path="settings"
                element={guarded('/app/settings', <SettingsPage />)}
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
