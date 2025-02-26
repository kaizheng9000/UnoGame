import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Ensure this is correct
import './index.css'; // Ensure the CSS file exists or remove this line

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
