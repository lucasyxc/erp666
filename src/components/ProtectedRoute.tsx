import { Navigate, useLocation } from 'react-router-dom';
import { authStorage } from '../utils/storage';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!authStorage.isLoggedIn()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
