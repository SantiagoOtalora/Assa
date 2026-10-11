import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ReporteBI } from '../../api/panel';
import {
  FACTOR_EXTENSION,
  PROVINCIAS,
  COSTO_DANO,
  COSTO_OPERACION,
  DEDUCIBLE,
  REGLAS_PRIORIDAD,
  TIPOS_PROPIEDAD,
  UMBRAL_ALTA,
  type NivelRegla,
  type Prioridad,
} from '../../shared/catalogos.js';
import { ESTADOS, MOTIVOS_CIERRE, esAbierto, tituloDe } from '../../shared/flujo.js';
import Caso from './Caso';
import {
  ICONO_NIVEL,
  Insignia,
  InsigniaEstado,
  NOMBRE_DANO,
  ORDEN,
  PRIORIDADES,
  REGLA,
  ceros,
  diaPanama,
  diasDesde,
  fmtFecha,
  fmtFechaHora,
  fmtNum,
  fmtPct,
  leerOperador,
  guardarOperador,
} from './comun';

type Filtros = {
  prioridad: string;
  estado: string;
  asignado: string;
  contacto: string;
  provincia: string;
  tipo: string;
  periodo: string;
  buscar: string;
};
const SIN_FILTROS: Filtros = { prioridad: '', estado: 'abiertos', asignado: '', contacto: '', provincia: '', tipo: '', periodo: '', buscar: '' };

// ---------------------------------------------------------------------------

export default function Panel() {
  const [reportes, setReportes] = useState<ReporteBI[] | null>(null);
  const [generado, setGenerado] = useState('');
  const [sinSesion, setSinSesion] = useState(false);
  const [error, setError] = useState('');
  const [operador, setOperador] = useState(leerOperador);
  const [pidiendoNombre, setPidiendoNombre] = useState(false);

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
          <button className="operador-encabezado" onClick={() => setPidiendoNombre(true)} title="Cambiar nombre">
            {operador || 'Indicar mi nombre'}
          </button>
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
        {reportes ? (
          <Tablero
            reportes={reportes}
            generado={generado}
            onActualizar={cargar}
            operador={operador}
            onCambiarOperador={() => setPidiendoNombre(true)}
          />
        ) : (
          <p className="cargando">Cargando…</p>
        )}
      </main>
      {(pidiendoNombre || (reportes && !operador)) && (
        <NombreOperador
          actual={operador}
          onGuardar={(nombre) => {
            guardarOperador(nombre);
            setOperador(nombre);
            setPidiendoNombre(false);
          }}
          onCancelar={operador ? () => setPidiendoNombre(false) : undefined}
        />
      )}
    </>
  );
}

function NombreOperador({ actual, onGuardar, onCancelar }: { actual: string; onGuardar: (n: string) => void; onCancelar?: () => void }) {
  const [nombre, setNombre] = useState(actual);
  return (
    <div className="modal-fondo centrado">
      <form
        className="tarjeta dialogo"
        onSubmit={(e) => {
          e.preventDefault();
          if (nombre.trim().length >= 2) onGuardar(nombre.trim());
        }}
      >
        <h2>¿Quién está usando el panel?</h2>
        <p className="sec">Su nombre queda registrado en cada acción que haga sobre los casos (estados, notas y contactos).</p>
        <div className="campo">
          <label htmlFor="operador">Nombre y apellido</label>
          <input id="operador" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus maxLength={60} />
        </div>
        <div className="fila-form">
          <button className="boton compacto" disabled={nombre.trim().length < 2}>
            Continuar
          </button>
          {onCancelar && (
            <button type="button" className="enlace" onClick={onCancelar}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
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

function filtrar(r: ReporteBI, f: Filtros, operador: string) {
  const q = f.buscar.trim().toLowerCase();
  return (
    (!f.prioridad || r.prioridad === f.prioridad) &&
    (!f.estado || (f.estado === 'abiertos' ? esAbierto(r.estado) : r.estado === f.estado)) &&
    (!f.asignado ||
      (f.asignado === 'sin_asignar' ? !r.asignadoA : f.asignado === 'mios' ? r.asignadoA === operador : r.asignadoA === f.asignado)) &&
    (!f.contacto || (f.contacto === 'sin_contacto' ? !r.contactado : r.contactado)) &&
    (!f.provincia || r.provincia === f.provincia) &&
    (!f.tipo || r.tipoPropiedad === f.tipo) &&
    (f.periodo !== 'hoy' || diaPanama(r.creadoEn) === diaPanama(new Date().toISOString())) &&
    (f.periodo !== '7d' || new Date(r.creadoEn).getTime() >= Date.now() - 7 * 86_400_000) &&
    (!q || [r.numero, r.nombre, r.poliza, r.telefono, r.distrito, r.asignadoA ?? ''].some((v) => v.toLowerCase().includes(q)))
  );
}

function Tablero({
  reportes,
  generado,
  onActualizar,
  operador,
  onCambiarOperador,
}: {
  reportes: ReporteBI[];
  generado: string;
  onActualizar: () => Promise<void>;
  operador: string;
  onCambiarOperador: () => void;
}) {
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [detalleNumero, setDetalleNumero] = useState<string | null>(null);
  const detalle = reportes.find((r) => r.numero === detalleNumero) ?? null;
  const conocidos = useMemo(
    () => [...new Set([operador, ...reportes.map((r) => r.asignadoA)].filter((n): n is string => !!n))].sort(),
    [reportes, operador],
  );
  const tip = useTooltip();

  const filtrados = useMemo(
    () =>
      reportes
        .filter((r) => filtrar(r, filtros, operador))
        .sort((a, b) => ORDEN[a.prioridad] - ORDEN[b.prioridad] || b.costo - a.costo || a.creadoEn.localeCompare(b.creadoEn)),
    [reportes, filtros, operador],
  );

  // El gráfico de estados ignora el filtro de estado para mostrar el embudo completo.
  const porEstado = useMemo(() => {
    const base = reportes.filter((r) => filtrar(r, { ...filtros, estado: '' }, operador));
    return ESTADOS.map((e) => ({ etiqueta: e.titulo, valor: base.filter((r) => r.estado === e.id).length }));
  }, [reportes, filtros, operador]);

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
              {p.etiqueta}
            </option>
          ))}
        </select>
        <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} aria-label="Estado">
          <option value="abiertos">Casos abiertos</option>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.titulo}
            </option>
          ))}
        </select>
        <select value={filtros.asignado} onChange={(e) => setFiltros({ ...filtros, asignado: e.target.value })} aria-label="Asignado a">
          <option value="">Cualquier responsable</option>
          {operador && <option value="mios">Mis casos</option>}
          <option value="sin_asignar">Sin asignar</option>
          {conocidos.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select value={filtros.contacto} onChange={(e) => setFiltros({ ...filtros, contacto: e.target.value })} aria-label="Contacto">
          <option value="">Con o sin contacto</option>
          <option value="sin_contacto">Sin contactar</option>
          <option value="contactado">Ya contactados</option>
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
                  {p.etiqueta}
                </span>
                <span className="kpi-valor">{fmtNum.format(porPrioridad[p.id])}</span>
                <span className="kpi-nota">{pct(porPrioridad[p.id])} del total</span>
              </div>
            ))}
            <div className="kpi">
              <span className="kpi-etiqueta">Probablemente superan el deducible</span>
              <span className="kpi-valor">{fmtNum.format(cuenta((r) => r.costo >= DEDUCIBLE))}</span>
              <span className="kpi-nota">costo estimado de {DEDUCIBLE} % o más · {pct(cuenta((r) => r.costo >= DEDUCIBLE))}</span>
            </div>
            <div className="kpi">
              <span className="kpi-etiqueta">Sin asignar</span>
              <span className="kpi-valor">{fmtNum.format(cuenta((r) => esAbierto(r.estado) && !r.asignadoA))}</span>
              <span className="kpi-nota">casos abiertos</span>
            </div>
            <div className="kpi">
              <span className="kpi-etiqueta">Sin contactar</span>
              <span className="kpi-valor">{fmtNum.format(cuenta((r) => esAbierto(r.estado) && !r.contactado))}</span>
              <span className="kpi-nota">
                {fmtNum.format(cuenta((r) => esAbierto(r.estado) && !r.contactado && diasDesde(r.creadoEn) >= 2))} con 2 días o más
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-etiqueta">Inspecciones programadas</span>
              <span className="kpi-valor">{fmtNum.format(cuenta((r) => r.estado === 'inspeccion_programada'))}</span>
              <span className="kpi-nota">pendientes de realizar</span>
            </div>
          </section>

          <section className="graficos">
            <Tarjeta titulo="Reportes por día" subtitulo="Por fecha de recepción, según prioridad" ancho>
              <Leyenda />
              <ColumnasPorDia reportes={filtrados} tip={tip} />
            </Tarjeta>

            <Tarjeta titulo="Casos por estado" subtitulo="Con los filtros actuales, sin importar el filtro de estado">
              <BarrasSimples filas={porEstado} color="var(--azul)" tip={tip} vacio="Sin casos" />
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

            <Tarjeta
              titulo="Distritos con más reportes que superan el deducible"
              subtitulo={`Costo estimado de ${DEDUCIBLE} % o más de la suma asegurada · top 10`}
            >
              <BarrasSimples
                filas={contarListas(
                  filtrados.filter((r) => r.costo >= DEDUCIBLE),
                  (r) => [`${r.distrito}, ${r.provincia}`],
                )
                  .slice(0, 10)
                  .map(([etiqueta, n]) => ({ etiqueta, valor: n }))}
                color="var(--azul)"
                tip={tip}
                vacio="Ningún reporte supera el deducible estimado"
              />
            </Tarjeta>
          </section>

          <Tarjeta titulo="Cola de atención" subtitulo="Ordenada por prioridad; dentro de cada prioridad, por mayor gasto estimado y luego por antigüedad" ancho>
            <Cola reportes={filtrados} onAbrir={(r) => setDetalleNumero(r.numero)} />
          </Tarjeta>
        </>
      )}

      <ReglasTexto />

      {tip.elemento}
      {detalle && (
        <Caso
          key={detalle.numero}
          r={detalle}
          operador={operador}
          conocidos={conocidos}
          onCambiarOperador={onCambiarOperador}
          onCerrar={() => setDetalleNumero(null)}
          onActualizado={onActualizar}
        />
      )}
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
    const f = mapa.get(k) ?? { etiqueta: k, porPrioridad: ceros(), total: 0 };
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
          {p.etiqueta}
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

const sumaDia = (v: Record<Prioridad, number>) => Object.values(v).reduce((a, b) => a + b, 0);

function ColumnasPorDia({ reportes, tip }: { reportes: ReporteBI[]; tip: Tip }) {
  const [contenedor, anchoDisponible] = useAncho();
  const dias = useMemo(() => {
    if (!reportes.length) return [];
    const mapa = new Map<string, Record<Prioridad, number>>();
    for (const r of reportes) {
      const d = diaPanama(r.creadoEn);
      const v = mapa.get(d) ?? ceros();
      v[r.prioridad as Prioridad]++;
      mapa.set(d, v);
    }
    // Rellena los días sin reportes para que el eje sea continuo.
    const claves = [...mapa.keys()].sort();
    const salida: { dia: string; v: Record<Prioridad, number> }[] = [];
    for (let t = new Date(claves[0] + 'T12:00:00Z'); diaPanama(t.toISOString()) <= claves.at(-1)!; t = new Date(t.getTime() + 86_400_000)) {
      const d = t.toISOString().slice(0, 10);
      salida.push({ dia: d, v: mapa.get(d) ?? ceros() });
    }
    return salida.slice(-45);
  }, [reportes]);

  if (!dias.length) return <p className="vacio-grafico">Sin reportes con estos filtros</p>;

  const alto = 220;
  const izq = 36;
  const ancho = Math.max(anchoDisponible, dias.length * 28 + izq, 280);
  const banda = (ancho - izq) / dias.length;
  const col = Math.min(24, banda - 6);
  const max = escalaLimpia(Math.max(...dias.map((d) => sumaDia(d.v))));
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
          const total = sumaDia(d.v);
          const segmentos = PRIORIDADES.filter((p) => d.v[p.id] > 0);
          const fecha = fmtFecha.format(new Date(d.dia + 'T12:00:00Z'));
          return (
            <g
              key={d.dia}
              className="marca-hover"
              {...tip.props(
                <TipFilas
                  titulo={`${fecha} · ${fmtNum.format(total)} reportes`}
                  filas={PRIORIDADES.map((p) => ({ nombre: p.etiqueta, valor: d.v[p.id], color: `var(--p-${p.id})` }))}
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
              filas={PRIORIDADES.map((p) => ({ nombre: p.etiqueta, valor: f.porPrioridad[p.id], color: `var(--p-${p.id})` }))}
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
  unidad = 'reportes',
  vacio = 'Sin reportes con estos filtros',
}: {
  filas: { etiqueta: string; valor: number }[];
  tip: Tip;
  color?: string;
  unidad?: string;
  vacio?: string;
}) {
  if (!filas.length) return <p className="vacio-grafico">{vacio}</p>;
  const max = escalaLimpia(Math.max(...filas.map((f) => f.valor)));
  return (
    <div className="barras">
      {filas.map((f) => (
        <div key={f.etiqueta} className="barra-fila marca-hover" {...tip.props(<TipFilas titulo={f.etiqueta} filas={[{ nombre: unidad, valor: f.valor }]} />)}>
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

const TITULO_NIVEL: Record<NivelRegla, string> = {
  alta: 'Llevan a prioridad alta',
  media: 'Llevan a prioridad media',
  rapido: 'Llevan a cierre rápido',
  baja: 'Prioridad baja',
  aviso: 'Avisos (no cambian la prioridad)',
};

function ReglasActivadas({ reportes, tip }: { reportes: ReporteBI[]; tip: Tip }) {
  const conteo = new Map(contarListas(reportes, (r) => r.motivos));
  const bajas = reportes.filter((r) => r.prioridad === 'baja').length;
  const max = escalaLimpia(Math.max(1, bajas, ...conteo.values()));
  const grupos: { nivel: NivelRegla; filas: { etiqueta: string; valor: number }[] }[] = [
    ...(['alta', 'media', 'rapido'] as const).map((nivel) => ({
      nivel,
      filas: REGLAS_PRIORIDAD.filter((r) => r.nivel === nivel).map((r) => ({ etiqueta: r.titulo, valor: conteo.get(r.id) ?? 0 })),
    })),
    { nivel: 'baja', filas: [{ etiqueta: 'Ninguna regla de prioridad aplica', valor: bajas }] },
    {
      nivel: 'aviso',
      filas: REGLAS_PRIORIDAD.filter((r) => r.nivel === 'aviso').map((r) => ({ etiqueta: r.titulo, valor: conteo.get(r.id) ?? 0 })),
    },
  ];
  return (
    <div className="reglas-activadas">
      {grupos.map((g) => (
        <div key={g.nivel} className="grupo-regla">
          <div className="grupo-regla-titulo">
            <span className={`marca marca-${g.nivel}`} aria-hidden>
              {ICONO_NIVEL[g.nivel]}
            </span>
            {TITULO_NIVEL[g.nivel]}
          </div>
          <div className="barras">
            {g.filas.map((f) => (
              <div key={f.etiqueta} className="barra-fila marca-hover" {...tip.props(<TipFilas titulo={f.etiqueta} filas={[{ nombre: 'reportes', valor: f.valor }]} />)}>
                <span className="barra-etiqueta">{f.etiqueta}</span>
                <span className="barra-pista">
                  <span className="barra-pila" style={{ width: `${(f.valor / max) * 100}%` }}>
                    {f.valor > 0 && <span className={`segmento p-${g.nivel}`} style={{ flexGrow: 1 }} />}
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
              <th className="num">Costo est.</th>
              <th>Número</th>
              <th>Estado</th>
              <th>Responsable</th>
              <th className="num">Días</th>
              <th>Último contacto</th>
              <th>Asegurado</th>
              <th>Ubicación</th>
              <th>Motivos</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.numero} onClick={() => onAbrir(r)} onKeyDown={(e) => e.key === 'Enter' && onAbrir(r)} tabIndex={0}>
                <td>
                  <Insignia prioridad={r.prioridad} />
                </td>
                <td className="num">{fmtPct(r.costo)}</td>
                <td className="mono">
                  {r.numero}
                  {r.pendiente && <span className="pendiente" title="Guardado en respaldo; se cargará a la base de datos en el próximo respaldo diario">respaldo</span>}
                </td>
                <td>
                  <InsigniaEstado estado={r.estado} />
                </td>
                <td>{r.asignadoA ?? <span className="sec">Sin asignar</span>}</td>
                <td className="num" title={`Recibido ${fmtFechaHora.format(new Date(r.creadoEn))}`}>
                  {diasDesde(r.creadoEn)}
                </td>
                <td className="mono">
                  {r.ultimoContacto ? (
                    <>
                      {fmtFechaHora.format(new Date(r.ultimoContacto))}
                      {!r.contactado && <div className="sec">sin respuesta</div>}
                    </>
                  ) : (
                    <span className="sin-contacto">Sin contactar</span>
                  )}
                </td>
                <td>
                  <div>{r.nombre}</div>
                  <div className="sec">
                    {r.poliza} · {r.telefono}
                  </div>
                </td>
                <td>
                  <div>{r.distrito}</div>
                  <div className="sec">
                    {r.provincia} · {r.tipoPropiedad}
                  </div>
                </td>
                <td className="motivos">
                  {r.motivos.length ? (
                    r.motivos.map((m) => (
                      <div key={m} className={REGLA[m]?.nivel === 'aviso' ? 'motivo-aviso' : undefined} title={REGLA[m]?.titulo}>
                        <span className={`marca marca-${REGLA[m]?.nivel}`} aria-hidden>
                          {ICONO_NIVEL[REGLA[m]?.nivel ?? 'baja']}
                        </span>{' '}
                        {REGLA[m]?.corto ?? m}
                      </div>
                    ))
                  ) : (
                    <span className="sec">Ninguno</span>
                  )}
                </td>
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

function ReglasTexto() {
  const costos = Object.entries(COSTO_DANO).sort((a, b) => b[1] - a[1]);
  return (
    <details className="tarjeta reglas-texto">
      <summary>Cómo se asigna la prioridad</summary>
      <p>
        La prioridad refleja el <strong>gasto estimado</strong> y la necesidad de resolver rápido, no el riesgo personal
        del asegurado. Se recalcula con estas reglas cada vez que se abre el panel.
      </p>
      <div className="reglas-columnas">
        {(['alta', 'media', 'rapido'] as const).map((nivel) => (
          <div key={nivel}>
            <h3>
              <Insignia prioridad={nivel} />
            </h3>
            <ul>
              {REGLAS_PRIORIDAD.filter((r) => r.nivel === nivel).map((r) => (
                <li key={r.id}>{r.titulo}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p>
        Si no aplica ninguna regla, queda en <strong>prioridad baja</strong>. La habitabilidad declarada solo cuenta si
        los daños la respaldan: <em>no habitable</em> requiere daño estructural, en techo o en todo el inmueble;{' '}
        <em>parcialmente</em> requiere además grietas abiertas, cielo raso o tuberías. Los riesgos de seguridad se muestran
        como aviso pero no cambian la prioridad.
      </p>
      <h3>Costo estimado (% de la suma asegurada)</h3>
      <p>
        Suma del costo típico de reparar cada daño en un área × extensión (un área ×{FACTOR_EXTENSION.puntual}, varias ×
        {FACTOR_EXTENSION.varias}, todo el inmueble ×{FACTOR_EXTENSION.total}) + operación del negocio en comercial e
        industrial (detenida +{COSTO_OPERACION.detenida} %, parcial +{COSTO_OPERACION.parcial} %). Menos de {DEDUCIBLE} %
        (el deducible residencial) es cierre rápido; de {DEDUCIBLE} % a {UMBRAL_ALTA} % es media; {UMBRAL_ALTA} % o más es
        alta. Referencia: vivienda de unos B/.150,000; en inmuebles de menor valor el porcentaje real es mayor.
      </p>
      <div className="tabla-puntos">
        {costos.map(([id, n]) => (
          <div key={id}>
            <span>{NOMBRE_DANO[id] ?? id}</span>
            <strong>{fmtPct(n)}</strong>
          </div>
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------

function exportarCsv(reportes: ReporteBI[]) {
  const columnas: [string, (r: ReporteBI) => unknown][] = [
    ['numero', (r) => r.numero],
    ['prioridad', (r) => PRIORIDADES.find((p) => p.id === r.prioridad)?.etiqueta ?? r.prioridad],
    ['costo_estimado_pct', (r) => r.costo],
    ['motivos', (r) => r.motivos.map((m) => REGLA[m]?.titulo ?? m).join(' | ')],
    ['recibido', (r) => r.creadoEn],
    ['estado', (r) => tituloDe(ESTADOS, r.estado)],
    ['motivo_cierre', (r) => tituloDe(MOTIVOS_CIERRE, r.motivoCierre)],
    ['asignado_a', (r) => r.asignadoA],
    ['fecha_inspeccion', (r) => r.fechaInspeccion],
    ['contactado', (r) => (r.contactado ? 'sí' : 'no')],
    ['ultimo_contacto', (r) => r.ultimoContacto],
    ['comunicaciones', (r) => r.comunicaciones],
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
