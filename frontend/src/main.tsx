import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './skins/base.css';

/**
 * No skin stylesheet is imported here on purpose.
 *
 * Each skin imports its own CSS from its own module (e.g. skins/x/x.css), so the
 * browser only downloads the stylesheet for the skin actually rendering. The
 * `base.css` above resets the document chrome that every skin relies on.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);