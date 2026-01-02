import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// Import axios config early to set base URL for all API calls
import './config/axios';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .catch((registrationError) => {
        // Silently fail - service worker is optional
      });
  });
}

