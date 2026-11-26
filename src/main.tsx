import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const boot = document.getElementById('boot');
if (boot) boot.remove();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
