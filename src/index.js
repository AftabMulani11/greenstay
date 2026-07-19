import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Demo mode (GitHub Pages): serve /api/* from an in-browser mock store
if (process.env.REACT_APP_DEMO === 'true') {
  const { installDemoApi } = require('./demo/demoApi');
  installDemoApi();
}

// Mounts the React application to the DOM root
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);