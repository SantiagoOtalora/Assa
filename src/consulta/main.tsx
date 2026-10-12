import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Consulta from './Consulta';
import '../styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Consulta />
  </StrictMode>,
);
