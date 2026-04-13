import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: real auth
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top section with logo */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        <div className="w-20 h-20 bg-accent rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-accent/20">
          <span className="text-white font-extrabold text-2xl">R.</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Rehab.You</h1>
        <p className="text-sm text-gray-500">Платформа обучения</p>
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
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 (900) 000-00-00"
              className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-surface text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-surface text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full h-12 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors shadow-sm shadow-accent/20 active:scale-[0.98]"
          >
            Войти
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">или</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Telegram button */}
        <button
          onClick={() => navigate('/')}
          className="w-full h-12 bg-[#2AABEE] hover:bg-[#229ED9] text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
          Войти через Telegram
        </button>

        <p className="text-center text-xs text-gray-400 mt-6">
          Нет аккаунта?{' '}
          <button className="text-accent font-medium hover:underline">
            Регистрация
          </button>
        </p>
      </div>
    </div>
  );
}
