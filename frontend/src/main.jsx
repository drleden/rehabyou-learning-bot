import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Global error handlers — prevent silent white screen on mobile browsers
if (typeof window !== 'undefined') {
  window.onerror = function (msg, src, line, col, err) {
    // eslint-disable-next-line no-console
    console.error('App error:', msg, src, line, col, err);
  };

  window.addEventListener('unhandledrejection', function (event) {
    // eslint-disable-next-line no-console
    console.error('Unhandled promise rejection:', event.reason);
  });
}

function renderApp() {
  try {
    const rootEl = document.getElementById('root');
    if (!rootEl) {
      throw new Error('Root element not found');
    }
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to render app:', err);
    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.innerHTML =
        '<div style="padding:2rem;text-align:center;font-family:sans-serif;">' +
        '<h2 style="color:#e8571a">Не удалось загрузить приложение</h2>' +
        '<p style="color:#666;font-size:14px">Попробуйте обновить страницу или очистить кэш браузера.</p>' +
        '</div>';
    }
  }
}

renderApp();
