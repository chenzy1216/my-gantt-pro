import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("找不到 root 節點，請檢查 index.html 結構");
}

// 採單次渲染模式，移除 StrictMode 避免雙重 Effect 導致的 DOM 操作錯誤
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);