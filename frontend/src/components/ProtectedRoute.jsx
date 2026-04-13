import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore, { hasMinimumRole } from '../store/authStore';

export default function ProtectedRoute({ children, minimumRole }) {
  const { user, token, isLoading, loadUser } = useAuthStore();

  useEffect(() => {
    if (token && !user) {
      loadUser();
    }
  }, [token, user, loadUser]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading || (!user && token)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (minimumRole && user && !hasMinimumRole(user.role, minimumRole)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
