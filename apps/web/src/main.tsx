import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './studio-extra.css';
import './ancv-brand.css';
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
