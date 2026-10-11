import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ReporteBI } from '../../api/panel';
import {
  EXTENSION,
  GRUPOS_DANO,
  HABITABILIDAD,
  OPERACION,
  PROVINCIAS,
  REGLAS_PRIORIDAD,
  RIESGOS,
  TIPOS_PROPIEDAD,
  type Prioridad,
} from '../../shared/catalogos.js';

const PRIORIDADES: { id: Prioridad; nombre: string; icono: string }[] = [
  { id: 'alta', nombre: 'Alta', icono: '▲' },
  { id: 'media', nombre: 'Media', icono: '■' },
  { id: 'baja', nombre: 'Baja', icono: '▼' },
];
const ORDEN: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const NOMBRE_DANO = Object.fromEntries(GRUPOS_DANO.flatMap((g) => g.tipos.map((t) => [t.id, t.titulo])));
const NOMBRE_RIESGO = Object.fromEntries(RIESGOS.map((r) => [r.id, r.titulo]));
const NOMBRE_HAB = Object.fromEntries(HABITABILIDAD.map((h) => [h.id, h.titulo]));
const NOMBRE_EXT = Object.fromEntries(EXTENSION.map((h) => [h.id, h.titulo]));
const NOMBRE_OPE = Object.fromEntries(OPERACION.map((h) => [h.id, h.titulo]));
const REGLA = Object.fromEntries(REGLAS_PRIORIDAD.map((r) => [r.id, r]));

const fmtNum = new Intl.NumberFormat('es-PA');
const fmtFecha = new Intl.DateTimeFormat('es-PA', { timeZone: 'America/Panama', day: '2-digit', month: 'short' });
const fmtFechaHora = new Intl.DateTimeFormat('es-PA', {
  timeZone: 'America/Panama',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const diaPanama = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Panama' });

type Filtros = { prioridad: string; provincia: string; tipo: string; periodo: string; buscar: string };
const SIN_FILTROS: Filtros = { prioridad: '', provincia: '', tipo: '', periodo: '', buscar: '' };

// ---------------------------------------------------------------------------

export default function Panel() {
  const [reportes, setReportes] = useState<ReporteBI[] | null>(null);
  const [generado, setGenerado] = useState('');
  const [sinSesion, setSinSesion] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/panel', { cache: 'no-store' });
      if (res.status === 401) return setSinSesion(true);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setReportes(json.reportes);
      setGenerado(json.generado);
      setSinSesion(false);
      setError('');
    } catch {
      setError('No se pudieron cargar los datos. Se reintentará automáticamente.');
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  if (sinSesion) return <Login onEntrar={cargar} />;

  return (
    <>
      <header className="encabezado">
        <div className="contenedor panel-contenedor encabezado-panel">
          <img className="logo" src="/logo-white.svg" alt="ASSA Compañía de Seguros" width="152" height="36" />
          <span className="logo-sub">Reportes sismo · Panel interno</span>
          <button
            className="salir"
            onClick={async () => {
              await fetch('/api/panel', { method: 'DELETE' });
              setSinSesion(true);
            }}
          >
            Salir
          </button>
        </div>
      </header>
      <main className="contenedor panel-contenedor">
        {error && <p className="error resumen">{error}</p>}
        {reportes ? <Tablero reportes={reportes} generado={generado} onActualizar={cargar} /> : <p className="cargando">Cargando…</p>}
      </main>
    </>
  );
}

function Login({ onEntrar }: { onEntrar: () => void }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    const res = await fetch('/api/panel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clave }),
    }).catch(() => null);
    setEnviando(false);
    if (res?.ok) onEntrar();
    else setError(res?.status === 401 ? 'Clave incorrecta.' : 'No se pudo iniciar sesión.');
  }

  return (
    <div className="login">
      <form className="tarjeta login-tarjeta" onSubmit={entrar}>
        <img src="/logo-blue.svg" alt="ASSA" width="152" height="36" />
        <h1>Panel de reportes</h1>
        <p>Acceso solo para el equipo de reclamos.</p>
        <div className="campo">
          <label htmlFor="clave">Clave</label>
          <input id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} autoFocus />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="boton" disabled={enviando || !clave}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tablero({ reportes, generado, onActualizar }: { reportes: ReporteBI[]; generado: string; onActualizar: () => void }) {
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [detalle, setDetalle] = useState<ReporteBI | null>(null);
  const tip = useTooltip();

  const filtrados = useMemo(() => {
    const hoy = diaPanama(new Date().toISOString());
    const hace7 = Date.now() - 7 * 86_400_000;
    const q = filtros.buscar.trim().toLowerCase();
    return reportes
      .filter(
        (r) =>
          (!filtros.prioridad || r.prioridad === filtros.prioridad) &&
          (!filtros.provincia || r.provincia === filtros.provincia) &&
          (!filtros.tipo || r.tipoPropiedad === filtros.tipo) &&
          (filtros.periodo !== 'hoy' || diaPanama(r.creadoEn) === hoy) &&
          (filtros.periodo !== '7d' || new Date(r.creadoEn).getTime() >= hace7) &&
          (!q || [r.numero, r.nombre, r.poliza, r.telefono, r.distrito].some((v) => v.toLowerCase().includes(q))),
      )
      .sort((a, b) => ORDEN[a.prioridad] - ORDEN[b.prioridad] || a.creadoEn.localeCompare(b.creadoEn));
  }, [reportes, filtros]);

  const total = filtrados.length;
  const cuenta = (fn: (r: ReporteBI) => boolean) => filtrados.filter(fn).length;
  const porPrioridad = Object.fromEntries(PRIORIDADES.map((p) => [p.id, cuenta((r) => r.prioridad === p.id)])) as Record<Prioridad, number>;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)} %` : '—');
  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(SIN_FILTROS);

  return (
    <>
      <div className="panel-titulo">
        <div>
          <h1>Reportes de daños por sismo</h1>
          <p>
            Actualizado {generado ? fmtFechaHora.format(new Date(generado)) : '—'} · se actualiza cada minuto ·{' '}
            <button className="enlace" onClick={onActualizar}>
              Actualizar ahora
            </button>
          </p>
        </div>
        <button className="boton secundario exportar" onClick={() => exportarCsv(filtrados)} disabled={!total}>
          Exportar CSV ({fmtNum.format(total)})
        </button>
      </div>

      <div className="filtros" role="group" aria-label="Filtros">
        <select value={filtros.prioridad} onChange={(e) => setFiltros({ ...filtros, prioridad: e.target.value })} aria-label="Prioridad">
          <option value="">Todas las prioridades</option>
          {PRIORIDADES.map((p) => (
            <option key={p.id} value={p.id}>
              Prioridad {p.nombre.toLowerCase()}
            </option>
          ))}
        </select>
        <select value={filtros.provincia} onChange={(e) => setFiltros({ ...filtros, provincia: e.target.value })} aria-label="Provincia">
          <option value="">Todas las provincias</option>
          {Object.keys(PROVINCIAS).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })} aria-label="Tipo de inmueble">
          <option value="">Todo tipo de inmueble</option>
          {TIPOS_PROPIEDAD.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={filtros.periodo} onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value })} aria-label="Periodo">
          <option value="">Desde el inicio</option>
          <option value="hoy">Hoy</option>
          <option value="7d">Últimos 7 días</option>
        </select>
        <input
          type="search"
          placeholder="Buscar número, nombre, póliza, teléfono…"
          value={filtros.buscar}
          onChange={(e) => setFiltros({ ...filtros, buscar: e.target.value })}
          aria-label="Buscar"
        />
        {hayFiltros && (
          <button className="enlace" onClick={() => setFiltros(SIN_FILTROS)}>
            Limpiar filtros
          </button>
        )}
      </div>

      {!reportes.length ? (
        <div className="tarjeta vacio">
          <h2>Aún no hay reportes</h2>
          <p>Cuando los asegurados envíen el formulario, aparecerán aquí clasificados por prioridad.</p>
        </div>
      ) : (
        <>
          <section className="kpis">
            <div className="kpi kpi-hero">
              <span className="kpi-etiqueta">Reportes</span>
              <span className="kpi-valor">{fmtNum.format(total)}</span>
              <span className="kpi-nota">{hayFiltros ? `de ${fmtNum.format(reportes.length)} en total` : 'en total'}</span>
            </div>
            {PRIORIDADES.map((p) => (
              <div key={p.id} className="kpi">
                <span className="kpi-etiqueta">
                  <span className={`marca marca-${p.id}`} aria-hidden>
                    {p.icono}
                  </span>
                  Prioridad {p.nombre.toLowerCase()}
                </span>
                <span className="kpi-valor">{fmtNum.format(porPrioridad[p.id])}</span>
                <span className="kpi-nota">{pct(porPrioridad[p.id])} del total</span>
              </div>
            ))}
            <div className="kpi">
              <span className="kpi-etiqueta">No habitables</span>
              <span className="kpi-valor">{fmtNum.format(cuenta((r) => r.habitabilidad === 'no'))}</span>
              <span className="kpi-nota">{fmtNum.format(cuenta((r) => r.habitabilidad === 'parcial'))} parcialmente</span>
            </div>
            <div className="kpi">
              <span className="kpi-etiqueta">Con riesgo activo</span>
              <span className="kpi-valor">{fmtNum.format(cuenta((r) => r.riesgos.length > 0))}</span>
              <span className="kpi-nota">gas, electricidad, caída o agua</span>
            </div>
            <div className="kpi">
              <span className="kpi-etiqueta">Operación detenida</span>
              <span className="kpi-valor">{fmtNum.format(cuenta((r) => r.operacion === 'detenida'))}</span>
              <span className="kpi-nota">comercial e industrial</span>
            </div>
          </section>

          <section className="graficos">
            <Tarjeta titulo="Reportes por día" subtitulo="Por fecha de recepción, según prioridad" ancho>
              <Leyenda />
              <ColumnasPorDia reportes={filtrados} tip={tip} />
            </Tarjeta>

            <Tarjeta titulo="Reglas de prioridad activadas" subtitulo="Reportes que cumplen cada regla (un reporte puede cumplir varias)">
              <ReglasActivadas reportes={filtrados} tip={tip} />
            </Tarjeta>

            <Tarjeta titulo="Reportes por provincia" subtitulo="Según prioridad">
              <Leyenda />
              <BarrasApiladas
                filas={agrupar(filtrados, (r) => r.provincia)}
                tip={tip}
                vacio="Sin reportes con estos filtros"
              />
            </Tarjeta>

            <Tarjeta titulo="Tipos de daño reportados" subtitulo="Reportes que marcaron cada tipo">
              <BarrasSimples
                filas={contarListas(filtrados, (r) => r.tiposDano).map(([id, n]) => ({ etiqueta: NOMBRE_DANO[id] ?? id, valor: n }))}
                tip={tip}
              />
            </Tarjeta>

            <Tarjeta titulo="Distritos con más reportes de prioridad alta" subtitulo="Top 10">
              <BarrasSimples
                filas={contarListas(
                  filtrados.filter((r) => r.prioridad === 'alta'),
                  (r) => [`${r.distrito}, ${r.provincia}`],
                )
                  .slice(0, 10)
                  .map(([etiqueta, n]) => ({ etiqueta, valor: n }))}
                color="var(--p-alta)"
                tip={tip}
                vacio="Sin reportes de prioridad alta"
              />
            </Tarjeta>
          </section>

          <Tarjeta titulo="Cola de atención" subtitulo="Ordenada por prioridad y, dentro de cada prioridad, del más antiguo al más reciente" ancho>
            <Cola reportes={filtrados} onAbrir={setDetalle} />
          </Tarjeta>
        </>
      )}

      <ReglasTexto />

      {tip.elemento}
      {detalle && <Detalle r={detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Agregaciones

type Fila = { etiqueta: string; porPrioridad: Record<Prioridad, number>; total: number };

function agrupar(reportes: ReporteBI[], clave: (r: ReporteBI) => string): Fila[] {
  const mapa = new Map<string, Fila>();
  for (const r of reportes) {
    const k = clave(r);
    const f = mapa.get(k) ?? { etiqueta: k, porPrioridad: { alta: 0, media: 0, baja: 0 }, total: 0 };
    f.porPrioridad[r.prioridad as Prioridad]++;
    f.total++;
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta));
}

function contarListas(reportes: ReporteBI[], lista: (r: ReporteBI) => string[]): [string, number][] {
  const mapa = new Map<string, number>();
  for (const r of reportes) for (const v of new Set(lista(r))) mapa.set(v, (mapa.get(v) ?? 0) + 1);
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

function escalaLimpia(max: number) {
  if (max <= 5) return 5;
  const paso = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / paso) * paso;
}

// ---------------------------------------------------------------------------
// Tooltip (uno por tablero)

type Tip = ReturnType<typeof useTooltip>;

function useTooltip() {
  const [estado, setEstado] = useState<{ x: number; y: number; contenido: ReactNode } | null>(null);
  const props = (contenido: ReactNode) => ({
    tabIndex: 0,
    onPointerMove: (e: React.PointerEvent) => setEstado({ x: e.clientX, y: e.clientY, contenido }),
    onPointerLeave: () => setEstado(null),
    onFocus: (e: React.FocusEvent<HTMLElement | SVGElement>) => {
      const b = e.currentTarget.getBoundingClientRect();
      setEstado({ x: b.left + b.width / 2, y: b.top, contenido });
    },
    onBlur: () => setEstado(null),
  });
  const elemento = estado && (
    <div
      className="tooltip"
      role="tooltip"
      style={{
        left: Math.min(estado.x + 14, window.innerWidth - 240),
        top: estado.y + 14,
      }}
    >
      {estado.contenido}
    </div>
  );
  return { props, elemento };
}

function TipFilas({ titulo, filas }: { titulo: string; filas: { nombre: string; valor: number; color?: string }[] }) {
  return (
    <>
      <div className="tooltip-titulo">{titulo}</div>
      {filas.map((f) => (
        <div key={f.nombre} className="tooltip-fila">
          {f.color && <span className="tooltip-llave" style={{ background: f.color }} />}
          <strong>{fmtNum.format(f.valor)}</strong>
          <span>{f.nombre}</span>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Gráficos

function Tarjeta({ titulo, subtitulo, ancho, children }: { titulo: string; subtitulo?: string; ancho?: boolean; children: ReactNode }) {
  return (
    <section className={'tarjeta grafico' + (ancho ? ' ancho' : '')}>
      <h2>{titulo}</h2>
      {subtitulo && <p className="grafico-sub">{subtitulo}</p>}
      {children}
    </section>
  );
}

function Leyenda() {
  return (
    <ul className="leyenda">
      {PRIORIDADES.map((p) => (
        <li key={p.id}>
          <span className={`swatch p-${p.id}`} aria-hidden />
          Prioridad {p.nombre.toLowerCase()}
        </li>
      ))}
    </ul>
  );
}

function useAncho() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, ancho] as const;
}

function ColumnasPorDia({ reportes, tip }: { reportes: ReporteBI[]; tip: Tip }) {
  const [contenedor, anchoDisponible] = useAncho();
  const dias = useMemo(() => {
    if (!reportes.length) return [];
    const mapa = new Map<string, Record<Prioridad, number>>();
    for (const r of reportes) {
      const d = diaPanama(r.creadoEn);
      const v = mapa.get(d) ?? { alta: 0, media: 0, baja: 0 };
      v[r.prioridad as Prioridad]++;
      mapa.set(d, v);
    }
    // Rellena los días sin reportes para que el eje sea continuo.
    const claves = [...mapa.keys()].sort();
    const salida: { dia: string; v: Record<Prioridad, number> }[] = [];
    for (let t = new Date(claves[0] + 'T12:00:00Z'); diaPanama(t.toISOString()) <= claves.at(-1)!; t = new Date(t.getTime() + 86_400_000)) {
      const d = t.toISOString().slice(0, 10);
      salida.push({ dia: d, v: mapa.get(d) ?? { alta: 0, media: 0, baja: 0 } });
    }
    return salida.slice(-45);
  }, [reportes]);

  if (!dias.length) return <p className="vacio-grafico">Sin reportes con estos filtros</p>;

  const alto = 220;
  const izq = 36;
  const ancho = Math.max(anchoDisponible, dias.length * 28 + izq, 280);
  const banda = (ancho - izq) / dias.length;
  const col = Math.min(24, banda - 6);
  const max = escalaLimpia(Math.max(...dias.map((d) => d.v.alta + d.v.media + d.v.baja)));
  const y = (n: number) => (n / max) * (alto - 24);
  const ticks = [0, max / 2, max];
  const cadaN = Math.ceil(dias.length / 10);

  return (
    <div className="scroll-x" ref={contenedor}>
      <svg width={ancho} height={alto + 28} role="img" aria-label="Reportes por día según prioridad" className="svg-grafico">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={izq} x2={ancho} y1={alto - y(t)} y2={alto - y(t)} className={t === 0 ? 'eje' : 'grid'} />
            <text x={izq - 8} y={alto - y(t) + 4} textAnchor="end" className="tick">
              {fmtNum.format(t)}
            </text>
          </g>
        ))}
        {dias.map((d, i) => {
          const x = izq + i * banda + (banda - col) / 2;
          let base = alto;
          const total = d.v.alta + d.v.media + d.v.baja;
          const segmentos = PRIORIDADES.filter((p) => d.v[p.id] > 0);
          const fecha = fmtFecha.format(new Date(d.dia + 'T12:00:00Z'));
          return (
            <g
              key={d.dia}
              className="marca-hover"
              {...tip.props(
                <TipFilas
                  titulo={`${fecha} · ${fmtNum.format(total)} reportes`}
                  filas={PRIORIDADES.map((p) => ({ nombre: `Prioridad ${p.nombre.toLowerCase()}`, valor: d.v[p.id], color: `var(--p-${p.id})` }))}
                />,
              )}
            >
              <rect x={izq + i * banda} y={0} width={banda} height={alto} fill="transparent" />
              {segmentos.map((p, j) => {
                const h = y(d.v[p.id]);
                const ultimo = j === segmentos.length - 1;
                const gap = j > 0 ? 2 : 0;
                base -= h;
                const alturaVisible = Math.max(h - gap, 1);
                return ultimo ? (
                  <path key={p.id} className={`p-${p.id}`} d={columnaRedondeada(x, base, col, alturaVisible)} />
                ) : (
                  <rect key={p.id} className={`p-${p.id}`} x={x} y={base} width={col} height={alturaVisible} />
                );
              })}
              {i % cadaN === 0 && (
                <text x={x + col / 2} y={alto + 18} textAnchor="middle" className="tick">
                  {fecha}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function columnaRedondeada(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function BarrasApiladas({ filas, tip, vacio }: { filas: Fila[]; tip: Tip; vacio: string }) {
  if (!filas.length) return <p className="vacio-grafico">{vacio}</p>;
  const max = escalaLimpia(Math.max(...filas.map((f) => f.total)));
  return (
    <div className="barras">
      {filas.map((f) => (
        <div
          key={f.etiqueta}
          className="barra-fila marca-hover"
          {...tip.props(
            <TipFilas
              titulo={`${f.etiqueta} · ${fmtNum.format(f.total)}`}
              filas={PRIORIDADES.map((p) => ({ nombre: `Prioridad ${p.nombre.toLowerCase()}`, valor: f.porPrioridad[p.id], color: `var(--p-${p.id})` }))}
            />,
          )}
        >
          <span className="barra-etiqueta">{f.etiqueta}</span>
          <span className="barra-pista">
            <span className="barra-pila" style={{ width: `${(f.total / max) * 100}%` }}>
              {PRIORIDADES.filter((p) => f.porPrioridad[p.id]).map((p) => (
                <span key={p.id} className={`segmento p-${p.id}`} style={{ flexGrow: f.porPrioridad[p.id] }} />
              ))}
            </span>
            <span className="barra-valor">{fmtNum.format(f.total)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function BarrasSimples({
  filas,
  tip,
  color = 'var(--p-baja)',
  vacio = 'Sin reportes con estos filtros',
}: {
  filas: { etiqueta: string; valor: number }[];
  tip: Tip;
  color?: string;
  vacio?: string;
}) {
  if (!filas.length) return <p className="vacio-grafico">{vacio}</p>;
  const max = escalaLimpia(Math.max(...filas.map((f) => f.valor)));
  return (
    <div className="barras">
      {filas.map((f) => (
        <div key={f.etiqueta} className="barra-fila marca-hover" {...tip.props(<TipFilas titulo={f.etiqueta} filas={[{ nombre: 'reportes', valor: f.valor }]} />)}>
          <span className="barra-etiqueta">{f.etiqueta}</span>
          <span className="barra-pista">
            <span className="barra-pila" style={{ width: `${(f.valor / max) * 100}%` }}>
              <span className="segmento" style={{ flexGrow: 1, background: color }} />
            </span>
            <span className="barra-valor">{fmtNum.format(f.valor)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ReglasActivadas({ reportes, tip }: { reportes: ReporteBI[]; tip: Tip }) {
  const conteo = new Map(contarListas(reportes, (r) => r.motivos));
  const sinReglas = reportes.filter((r) => !r.motivos.length).length;
  const max = escalaLimpia(Math.max(1, sinReglas, ...conteo.values()));
  const grupos: { prioridad: Prioridad; filas: { etiqueta: string; valor: number }[] }[] = [
    ...(['alta', 'media'] as const).map((p) => ({
      prioridad: p,
      filas: REGLAS_PRIORIDAD.filter((r) => r.prioridad === p).map((r) => ({ etiqueta: r.titulo, valor: conteo.get(r.id) ?? 0 })),
    })),
    { prioridad: 'baja', filas: [{ etiqueta: 'Ninguna regla aplica', valor: sinReglas }] },
  ];
  return (
    <div className="reglas-activadas">
      {grupos.map((g) => (
        <div key={g.prioridad} className="grupo-regla">
          <div className="grupo-regla-titulo">
            <span className={`marca marca-${g.prioridad}`} aria-hidden>
              {PRIORIDADES.find((p) => p.id === g.prioridad)!.icono}
            </span>
            Lleva a prioridad {g.prioridad}
          </div>
          <div className="barras">
            {g.filas.map((f) => (
              <div key={f.etiqueta} className="barra-fila marca-hover" {...tip.props(<TipFilas titulo={f.etiqueta} filas={[{ nombre: 'reportes', valor: f.valor }]} />)}>
                <span className="barra-etiqueta">{f.etiqueta}</span>
                <span className="barra-pista">
                  <span className="barra-pila" style={{ width: `${(f.valor / max) * 100}%` }}>
                    {f.valor > 0 && <span className={`segmento p-${g.prioridad}`} style={{ flexGrow: 1 }} />}
                  </span>
                  <span className="barra-valor">{fmtNum.format(f.valor)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cola y detalle

const POR_PAGINA = 50;

function Cola({ reportes, onAbrir }: { reportes: ReporteBI[]; onAbrir: (r: ReporteBI) => void }) {
  const [pagina, setPagina] = useState(0);
  useEffect(() => setPagina(0), [reportes]);
  if (!reportes.length) return <p className="vacio-grafico">Sin reportes con estos filtros</p>;
  const paginas = Math.ceil(reportes.length / POR_PAGINA);
  const visibles = reportes.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  return (
    <>
      <div className="scroll-x">
        <table className="cola">
          <thead>
            <tr>
              <th>Prioridad</th>
              <th>Número</th>
              <th>Recibido</th>
              <th>Asegurado</th>
              <th>Ubicación</th>
              <th>Inmueble</th>
              <th>Motivos de prioridad</th>
              <th className="num">Fotos</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.numero} onClick={() => onAbrir(r)} onKeyDown={(e) => e.key === 'Enter' && onAbrir(r)} tabIndex={0}>
                <td>
                  <Insignia prioridad={r.prioridad} />
                </td>
                <td className="mono">
                  {r.numero}
                  {r.pendiente && <span className="pendiente" title="Guardado en respaldo; se cargará a la base de datos en el próximo respaldo diario">respaldo</span>}
                </td>
                <td className="mono">{fmtFechaHora.format(new Date(r.creadoEn))}</td>
                <td>
                  <div>{r.nombre}</div>
                  <div className="sec">
                    {r.poliza} · {r.telefono}
                  </div>
                </td>
                <td>
                  <div>{r.distrito}</div>
                  <div className="sec">{r.provincia}</div>
                </td>
                <td>{r.tipoPropiedad}</td>
                <td className="motivos">{r.motivos.length ? r.motivos.map((m) => REGLA[m]?.titulo ?? m).join(' · ') : <span className="sec">Ninguno</span>}</td>
                <td className="num">{r.fotos.length || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <div className="paginacion">
          <button className="enlace" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
            ← Anterior
          </button>
          <span>
            Página {pagina + 1} de {paginas}
          </span>
          <button className="enlace" disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)}>
            Siguiente →
          </button>
        </div>
      )}
    </>
  );
}

function Insignia({ prioridad }: { prioridad: string }) {
  const p = PRIORIDADES.find((x) => x.id === prioridad) ?? PRIORIDADES[2];
  return (
    <span className={`insignia insignia-${p.id}`}>
      <span aria-hidden>{p.icono}</span> {p.nombre}
    </span>
  );
}

function Detalle({ r, onCerrar }: { r: ReporteBI; onCerrar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  const dato = (etiqueta: string, valor: ReactNode) => (
    <div className="dato">
      <dt>{etiqueta}</dt>
      <dd>{valor || '—'}</dd>
    </div>
  );

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <aside className="modal" role="dialog" aria-modal="true" aria-label={`Reporte ${r.numero}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-cabecera">
          <div>
            <Insignia prioridad={r.prioridad} />
            <h2>{r.numero}</h2>
            <p className="sec">Recibido {fmtFechaHora.format(new Date(r.creadoEn))}</p>
          </div>
          <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <h3>Motivos de prioridad</h3>
        {r.motivos.length ? (
          <ul className="lista-motivos">
            {r.motivos.map((m) => (
              <li key={m}>
                <span className={`marca marca-${REGLA[m]?.prioridad}`} aria-hidden>
                  {REGLA[m]?.prioridad === 'alta' ? '▲' : '■'}
                </span>
                {REGLA[m]?.titulo ?? m}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sec">Ninguna regla aplica: prioridad baja.</p>
        )}

        <dl className="datos">
          {dato('Asegurado', r.nombre)}
          {dato('Póliza', r.poliza)}
          {dato('Unidad', r.unidad)}
          {dato('Teléfono', <a href={`tel:+507${r.telefono.replace(/^\+?507/, '')}`}>{r.telefono}</a>)}
          {dato('Correo', <a href={`mailto:${r.correo}`}>{r.correo}</a>)}
          {dato('Ubicación', `${r.distrito}, ${r.provincia}`)}
          {dato('Dirección', r.direccion)}
          {dato('Inmueble', r.tipoPropiedad)}
          {dato('Habitabilidad', NOMBRE_HAB[r.habitabilidad] ?? r.habitabilidad)}
          {dato('Riesgos', r.riesgos.map((x) => NOMBRE_RIESGO[x] ?? x).join(', ') || 'Ninguno')}
          {dato('Extensión', NOMBRE_EXT[r.extension] ?? r.extension)}
          {r.operacion && dato('Operación', NOMBRE_OPE[r.operacion] ?? r.operacion)}
          {dato('Fecha del daño', r.fechaDano)}
          {dato('Tipos de daño', r.tiposDano.map((x) => NOMBRE_DANO[x] ?? x).join(', '))}
        </dl>

        <h3>Relato</h3>
        <p className="relato">{r.descripcion}</p>

        {r.fotos.length > 0 && (
          <>
            <h3>Fotos ({r.fotos.length})</h3>
            <div className="fotos-detalle">
              {r.fotos.map((f, i) => {
                const src = `/api/panel?foto=${encodeURIComponent(f)}`;
                return (
                  <a key={f} href={src} target="_blank" rel="noreferrer">
                    <img src={src} alt={`Foto ${i + 1} del reporte ${r.numero}`} loading="lazy" />
                  </a>
                );
              })}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function ReglasTexto() {
  return (
    <details className="tarjeta reglas-texto">
      <summary>Cómo se asigna la prioridad</summary>
      <p>
        Cada reporte se evalúa con estas reglas al recibirlo. Si cumple al menos una regla de prioridad alta, queda en{' '}
        <strong>alta</strong>; si solo cumple reglas de prioridad media, queda en <strong>media</strong>; si no cumple
        ninguna, queda en <strong>baja</strong>.
      </p>
      <div className="reglas-columnas">
        {(['alta', 'media'] as const).map((p) => (
          <div key={p}>
            <h3>
              <Insignia prioridad={p} />
            </h3>
            <ul>
              {REGLAS_PRIORIDAD.filter((r) => r.prioridad === p).map((r) => (
                <li key={r.id}>{r.titulo}</li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3>
            <Insignia prioridad="baja" />
          </h3>
          <ul>
            <li>Ninguna de las anteriores (fisuras, acabados, vidrios, contenido o inventario)</li>
          </ul>
        </div>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------

function exportarCsv(reportes: ReporteBI[]) {
  const columnas: [string, (r: ReporteBI) => unknown][] = [
    ['numero', (r) => r.numero],
    ['prioridad', (r) => r.prioridad],
    ['motivos', (r) => r.motivos.map((m) => REGLA[m]?.titulo ?? m).join(' | ')],
    ['recibido', (r) => r.creadoEn],
    ['estado', (r) => r.estado],
    ['nombre', (r) => r.nombre],
    ['poliza', (r) => r.poliza],
    ['unidad', (r) => r.unidad],
    ['telefono', (r) => r.telefono],
    ['correo', (r) => r.correo],
    ['provincia', (r) => r.provincia],
    ['distrito', (r) => r.distrito],
    ['direccion', (r) => r.direccion],
    ['tipo_inmueble', (r) => r.tipoPropiedad],
    ['habitabilidad', (r) => r.habitabilidad],
    ['riesgos', (r) => r.riesgos.join(' | ')],
    ['extension', (r) => r.extension],
    ['operacion', (r) => r.operacion],
    ['tipos_dano', (r) => r.tiposDano.map((x) => NOMBRE_DANO[x] ?? x).join(' | ')],
    ['fecha_dano', (r) => r.fechaDano],
    ['descripcion', (r) => r.descripcion],
    ['fotos', (r) => r.fotos.length],
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
  a.download = `reportes-sismo-${diaPanama(new Date().toISOString())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
