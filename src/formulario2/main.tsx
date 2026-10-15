import '../ambiente';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Formulario2 from './Formulario2';
import '../styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Formulario2 />
  </StrictMode>,
);
