// Aviso fijo en todas las páginas cuando la app corre en el ambiente de pruebas
// (Preview de Vercel, con su propia base de datos y archivos).
declare const __AMBIENTE__: string;

export const AMBIENTE = __AMBIENTE__;

if (AMBIENTE === 'pruebas' && typeof document !== 'undefined') {
  const aviso = document.createElement('div');
  aviso.className = 'aviso-ambiente';
  aviso.setAttribute('role', 'note');
  aviso.textContent = 'Ambiente de pruebas · los datos no son reales';
  document.body.appendChild(aviso);
  document.title = `[Pruebas] ${document.title}`;
}
