import '../ambiente';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Panel from './Panel';
import '../styles.css';
import './panel.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Panel />
  </StrictMode>,
);
