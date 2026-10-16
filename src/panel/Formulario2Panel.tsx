// Reportes recibidos por el Formulario 2 (/formulario2), con búsqueda y exportación CSV.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { HABITABILIDAD } from '../../shared/catalogos.js';
import { NOMBRE_DANO, NOMBRE_RIESGO, fmtFechaHora, fmtNum } from './comun';

type ReporteF2 = {
  id: number;
  numero: string;
  creadoEn: string;
  reclamo: string;
  poliza: string;
  unidad: string | null;
  tiposDano: string[];
  habitabilidad: string;
  superaDeducible: boolean | null; // null: reportes anteriores a la pregunta
  riesgos: string[];
  descripcion: string;
  reclamoVinculado: string | null;
};

const NOMBRE_HAB = Object.fromEntries(HABITABILIDAD.map((h) => [h.id, h.titulo.split(':')[0]]));
const deducible = (r: ReporteF2) => (r.superaDeducible == null ? '' : r.superaDeducible ? 'Sí' : 'No');
const danos = (r: ReporteF2) => r.tiposDano.map((x) => NOMBRE_DANO[x] ?? x).join(', ');
const riesgos = (r: ReporteF2) => (r.riesgos.length ? r.riesgos.map((x) => NOMBRE_RIESGO[x] ?? x).join(', ') : 'Ninguna');

function exportar(reportes: ReporteF2[]) {
  const columnas: [string, (r: ReporteF2) => unknown][] = [
    ['numero', (r) => r.numero],
    ['recibido', (r) => r.creadoEn],
    ['reclamo', (r) => r.reclamo],
    ['poliza', (r) => r.poliza],
    ['unidad', (r) => r.unidad],
    ['tipos_dano', (r) => danos(r)],
    ['habitabilidad', (r) => NOMBRE_HAB[r.habitabilidad] ?? r.habitabilidad],
    ['supera_deducible', (r) => deducible(r)],
    ['riesgos', (r) => riesgos(r)],
    ['descripcion', (r) => r.descripcion],
    ['reclamo_en_plataforma', (r) => r.reclamoVinculado],
  ];
  const celda = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // evita fórmulas al abrir en Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [columnas.map(([c]) => c).join(','), ...reportes.map((r) => columnas.map(([, f]) => celda(f(r))).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `formulario2-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Formulario2Panel() {
  const [reportes, setReportes] = useState<ReporteF2[] | null>(null);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch('/api/formulario2', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) {
      setReportes((await res.json()).reportes);
      setError('');
    } else setError('No se pudieron cargar los reportes. Se reintentará automáticamente.');
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (reportes ?? []).filter((r) => !q || [r.numero, r.reclamo, r.poliza, r.unidad ?? '', r.descripcion].some((x) => x.toLowerCase().includes(q)));
  }, [reportes, buscar]);

  return (
    <>
      <div className="panel-titulo">
        <div>
          <h1>Formulario 2</h1>
          <p>
            Reportes de daños de reclamos existentes enviados desde <a href="/formulario2">/formulario2</a> (sin acceso). Se guardan en su propia tabla.
          </p>
        </div>
      </div>
      {error && <p className="error resumen">{error}</p>}

      <section className="tarjeta grafico ancho">
        <div className="f2-barra">
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar número, reclamo, póliza, unidad o descripción…" aria-label="Buscar" />
          <button className="boton compacto secundario" disabled={!visibles.length} onClick={() => exportar(visibles)}>
            Exportar CSV
          </button>
        </div>
        <h2>Reportes ({reportes ? fmtNum.format(visibles.length) : '…'})</h2>
        {!reportes ? (
          <p className="sec">Cargando…</p>
        ) : !visibles.length ? (
          <p className="sec">{reportes.length ? 'Ningún reporte coincide con la búsqueda.' : 'Todavía no hay reportes.'}</p>
        ) : (
          <div className="scroll-x">
            <table className="cola">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Recibido</th>
                  <th>Reclamo</th>
                  <th>Póliza</th>
                  <th>Habitable</th>
                  <th>Supera deducible</th>
                  <th>Daños</th>
                  <th>Riesgos</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="fila-f2" onClick={() => setAbierto(abierto === r.id ? null : r.id)} aria-expanded={abierto === r.id}>
                      <td className="mono">{r.numero}</td>
                      <td className="mono">{fmtFechaHora.format(new Date(r.creadoEn))}</td>
                      <td>
                        {r.reclamo}
                        {r.reclamoVinculado && <div className="sec">en la plataforma</div>}
                      </td>
                      <td>
                        {r.poliza}
                        {r.unidad && <div className="sec">Unidad {r.unidad}</div>}
                      </td>
                      <td>{NOMBRE_HAB[r.habitabilidad] ?? r.habitabilidad}</td>
                      <td>{deducible(r) || <span className="sec">Sin dato</span>}</td>
                      <td>{danos(r)}</td>
                      <td className={r.riesgos.some((x) => x !== 'agua') ? 'sin-contacto' : ''}>{riesgos(r)}</td>
                    </tr>
                    {abierto === r.id && (
                      <tr>
                        <td colSpan={8}>
                          <p className="relato">{r.descripcion || <span className="sec">Sin descripción.</span>}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
