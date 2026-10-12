// Constantes y piezas compartidas por el panel y la ficha del caso.
import { useEffect, useState } from 'react';
import {
  EXTENSION,
  GRUPOS_DANO,
  HABITABILIDAD,
  OPERACION,
  REGLAS_PRIORIDAD,
  RIESGOS,
  type NivelRegla,
  type Prioridad,
} from '../../shared/catalogos.js';
import { ESTADOS, tituloDe } from '../../shared/flujo.js';

export const PRIORIDADES: { id: Prioridad; etiqueta: string; icono: string }[] = [
  { id: 'alta', etiqueta: 'Prioridad alta', icono: '▲' },
  { id: 'media', etiqueta: 'Prioridad media', icono: '■' },
  { id: 'rapido', etiqueta: 'Cierre rápido', icono: '✓' },
  { id: 'baja', etiqueta: 'Prioridad baja', icono: '▼' },
];
export const ORDEN: Record<string, number> = { alta: 0, media: 1, rapido: 2, baja: 3 };
export const ICONO_NIVEL: Record<NivelRegla, string> = { alta: '▲', media: '■', rapido: '✓', baja: '▼', aviso: '!' };
export const ceros = (): Record<Prioridad, number> => ({ alta: 0, media: 0, rapido: 0, baja: 0 });
export const NOMBRE_DANO = Object.fromEntries(GRUPOS_DANO.flatMap((g) => g.tipos.map((t) => [t.id, t.titulo])));
export const NOMBRE_RIESGO = Object.fromEntries(RIESGOS.map((r) => [r.id, r.titulo]));
export const NOMBRE_HAB = Object.fromEntries(HABITABILIDAD.map((h) => [h.id, h.titulo]));
export const NOMBRE_EXT = Object.fromEntries(EXTENSION.map((h) => [h.id, h.titulo]));
export const NOMBRE_OPE = Object.fromEntries(OPERACION.map((h) => [h.id, h.titulo]));
export const REGLA = Object.fromEntries(REGLAS_PRIORIDAD.map((r) => [r.id, r]));

export const fmtNum = new Intl.NumberFormat('es-PA');
export const fmtPct = (n: number) => `${n.toLocaleString('es-PA', { maximumFractionDigits: 1 })} %`;
export const fmtFecha = new Intl.DateTimeFormat('es-PA', { timeZone: 'America/Panama', day: '2-digit', month: 'short' });
export const fmtFechaHora = new Intl.DateTimeFormat('es-PA', {
  timeZone: 'America/Panama',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
export const diaPanama = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Panama' });
export const diasDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

// true en pantallas de celular (mismo corte que el CSS).
export function useEsMovil(corte = 760) {
  const consulta = `(max-width: ${corte}px)`;
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const cambiar = () => setMovil(mq.matches);
    mq.addEventListener('change', cambiar);
    return () => mq.removeEventListener('change', cambiar);
  }, [consulta]);
  return movil;
}

export function Insignia({ prioridad }: { prioridad: string }) {
  const p = PRIORIDADES.find((x) => x.id === prioridad) ?? PRIORIDADES[3];
  return (
    <span className={`insignia insignia-${p.id}`}>
      <span aria-hidden>{p.icono}</span> {p.etiqueta}
    </span>
  );
}

export function InsigniaEstado({ estado }: { estado: string }) {
  return <span className={`estado estado-${estado}`}>{tituloDe(ESTADOS, estado)}</span>;
}
