
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// 移除 StrictMode 以避免開發/部署環境下雙重渲染導致的 DOM 操作衝突
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
