import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './skins/base.css';

// First-paint guard for failures before App's skin error boundary exists.
function renderBootFallback(): void {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif"><p>页面启动失败，请刷新重试。</p></main>';
  }
}
window.addEventListener('error', renderBootFallback);

/**
 * No skin stylesheet is imported here on purpose.
 *
 * Each skin imports its own CSS from its own module (e.g. skins/placeholder/placeholder.css), so the
 * browser only downloads the stylesheet for the skin actually rendering. The
 * `base.css` above resets the document chrome that every skin relies on.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// After App mounts, skin/runtime failures use its more specific error boundary.
queueMicrotask(() => window.removeEventListener('error', renderBootFallback));
