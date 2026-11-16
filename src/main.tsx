import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Propagate active operator RBAC context to backend /api/* endpoints automatically
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  try {
    const nativeFetch = window.fetch.bind(window);
    const wrappedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.startsWith('/api/')) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has('x-kpims-role')) {
          const activeRole = localStorage.getItem('kpims_active_role') || 'ADMIN';
          headers.set('x-kpims-role', activeRole);
        }
        if (!headers.has('x-kpims-uid')) {
          const activeUid = localStorage.getItem('kpims_active_uid') || 'USR-PROD-01';
          headers.set('x-kpims-uid', activeUid);
        }
        return nativeFetch(input, { ...init, headers });
      }
      return nativeFetch(input, init);
    };

    const ownDesc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!ownDesc || ownDesc.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: wrappedFetch,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else if (ownDesc.writable) {
      window.fetch = wrappedFetch;
    }
  } catch {
    // Preserve native fetch if host sandbox disallows redefining window.fetch
  }
}

// Register Service Worker for offline factory floor operations
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);


