import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getRoleLabel } from '../utils/roles';

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  return (
    <div className="bg-white min-h-screen pb-24">
      <div className="flex flex-col items-center pt-10 pb-6">
        <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
          <span className="text-white font-extrabold text-2xl">{getInitials(user.full_name)}</span>
        </div>
        <h1 className="text-xl font-extrabold text-gray-900 mt-4">
          {user.first_name} {user.last_name}
        </h1>
        <span className="text-sm text-accent font-medium mt-1">{getRoleLabel(user.role)}</span>
      </div>

      <div className="px-4 space-y-2">
        {user.phone && (
          <div className="flex items-center gap-3 p-4 bg-surface rounded-2xl">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span className="text-sm text-gray-900">{user.phone}</span>
          </div>
        )}

        <button
          disabled
          className="w-full flex items-center gap-3 p-4 bg-surface rounded-2xl text-left opacity-50"
        >
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span className="text-sm text-gray-700">Сменить пароль</span>
          <span className="ml-auto text-[10px] text-gray-400 font-medium">Скоро</span>
        </button>
      </div>

      <div className="px-4 mt-8">
        <button
          onClick={handleLogout}
          className="w-full h-12 bg-red-50 text-red-600 font-semibold rounded-xl text-sm hover:bg-red-100 transition-colors active:scale-[0.98]"
        >
          Выйти
        </button>
      </div>
    </div>
  );
}
