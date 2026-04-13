import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore, { hasMinimumRole } from '../store/authStore';

function formatPhone(value) {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 0) return '';

  let normalized = digits;
  if (normalized.startsWith('8') && normalized.length > 1) {
    normalized = '7' + normalized.slice(1);
  }
  if (!normalized.startsWith('7')) {
    normalized = '7' + normalized;
  }

  let formatted = '+7';
  if (normalized.length > 1) formatted += ' (' + normalized.slice(1, 4);
  if (normalized.length > 4) formatted += ') ' + normalized.slice(4, 7);
  if (normalized.length > 7) formatted += '-' + normalized.slice(7, 9);
  if (normalized.length > 9) formatted += '-' + normalized.slice(9, 11);

  return formatted;
}

function phoneToRaw(formatted) {
  const digits = formatted.replace(/\D/g, '');
  if (!digits) return '';
  return '+' + digits;
}

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handlePhoneChange = (e) => {
    clearError();
    const formatted = formatPhone(e.target.value);
    if (formatted.replace(/\D/g, '').length <= 11) {
      setPhone(formatted);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const rawPhone = phoneToRaw(phone);
    if (!rawPhone || !password) return;

    try {
      const user = await login(rawPhone, password);
      if (hasMinimumRole(user.role, 'manager')) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch {
      // error is already set in store
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top section with logo */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        <div className="w-20 h-20 bg-accent rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-accent/20">
          <span className="text-white font-extrabold text-2xl">R.</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Rehab.You</h1>
        <p className="text-sm text-gray-500">Обучение</p>
      </div>

      {/* Form section */}
      <div className="px-6 pb-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Телефон
            </label>
            <input
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="+7 (900) 000-00-00"
              autoComplete="tel"
              className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-surface text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Пароль
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  clearError();
                  setPassword(e.target.value);
                }}
                placeholder="Введите пароль"
                autoComplete="current-password"
                className="w-full h-12 px-4 pr-12 rounded-xl border border-gray-200 bg-surface text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-accent/20 active:scale-[0.98] flex items-center justify-center"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Войти'
            )}
          </button>
        </form>

        {/* Error message */}
        {error && (
          <p className="text-center text-sm text-red-500 mt-3 font-medium">
            {error}
          </p>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">или</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Telegram button */}
        <button
          disabled
          className="w-full h-12 bg-gray-100 text-gray-400 font-semibold rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
          Войти через Telegram
        </button>
      </div>
    </div>
  );
}
