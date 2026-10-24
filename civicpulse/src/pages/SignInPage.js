import { Link, Navigate } from 'react-router-dom';
import AuthBox from '../components/AuthBox';
import AuthLayout from '../components/auth/AuthLayout';
import { useAuth } from '../auth/AuthContext';

export default function SignInPage() {
  const { isAuthenticated, mustChangePassword } = useAuth();
  if (isAuthenticated) return <Navigate to={mustChangePassword ? '/change-password' : '/app/dashboard'} replace />;
  return (
    <AuthLayout title="Welcome back to the Eluru campaign desk" subtitle="Sign in to see your booths, voters and today’s work.">
      <AuthBox />
      <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-white/85">
        <Link to="/request-access" className="underline-offset-4 hover:text-white hover:underline">
          Request access
        </Link>
        <span aria-hidden className="text-white/30">·</span>
        <Link to="/request-status" className="underline-offset-4 hover:text-white hover:underline">
          Check request status
        </Link>
      </p>
    </AuthLayout>
  );
}
