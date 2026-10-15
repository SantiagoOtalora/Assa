// Piezas de las páginas públicas (formulario, Formulario 2): encabezado y pie de ASSA,
// secciones numeradas y campos con su etiqueta, ayuda y error.
import type { ReactNode } from 'react';

export function Marco({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="encabezado">
        <div className="contenedor">
          <img className="logo" src="/logo-white.svg" alt="ASSA Compañía de Seguros" width="152" height="36" />
          <span className="logo-sub">Compañía de Seguros · Panamá</span>
        </div>
      </header>
      <main className="contenedor">{children}</main>
      <footer className="pie">
        <div className="contenedor">
          <p>¿Emergencia? Llame al 911. Para consultas sobre su póliza contacte a su corredor o a ASSA.</p>
        </div>
      </footer>
    </>
  );
}

export function Seccion({ n, titulo, opcional, children }: { n: number; titulo: string; opcional?: boolean; children: ReactNode }) {
  return (
    <section className="seccion">
      <h2>
        <span className="paso">{n}</span>
        {titulo}
        {opcional && <span className="opcional">Opcional</span>}
      </h2>
      {children}
    </section>
  );
}

export function Campo(props: {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  opcional?: boolean;
  angosto?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={'campo' + (props.error ? ' invalido' : '') + (props.angosto ? ' angosto' : '')}>
      <label htmlFor={props.id}>
        {props.etiqueta}
        {props.opcional && <span className="opcional">Opcional</span>}
      </label>
      {props.ayuda && <span className="ayuda">{props.ayuda}</span>}
      {props.children}
      {props.error && <span className="error">{props.error}</span>}
    </div>
  );
}

export function Grupo(props: { etiqueta: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <div className={'campo' + (props.error ? ' invalido' : '')}>
      <span className="etiqueta">{props.etiqueta}</span>
      {props.ayuda && <span className="ayuda">{props.ayuda}</span>}
      {props.children}
      {props.error && <span className="error">{props.error}</span>}
    </div>
  );
}
