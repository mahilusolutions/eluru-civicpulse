import { Navigate } from 'react-router-dom';
import AuthBox from '../components/AuthBox';
import AuthLayout from '../components/auth/AuthLayout';
import { useAuth } from '../auth/AuthContext';

export default function SignInPage() {
  const { isAuthenticated, mustChangePassword } = useAuth();
  if (isAuthenticated) return <Navigate to={mustChangePassword ? '/change-password' : '/app/dashboard'} replace />;
  return (
    <AuthLayout title="Welcome back to the Eluru campaign desk" subtitle="Sign in to see your booths, voters and today’s work.">
      <AuthBox />
    </AuthLayout>
  );
}
