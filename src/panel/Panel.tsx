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
import { CAUSAS, COBERTURAS, ESTADOS, REPORTANTES, TODOS_LOS_MOTIVOS, esAbierto, tituloDe } from '../../shared/flujo.js';
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
  useEsMovil,
} from './comun';
import Usuarios from './Usuarios';
import { ROLES, type Permisos, type UsuarioSesion } from '../../shared/roles.js';

type Filtros = {
  prioridad: string;
  estado: string;
  asignado: string;
  contacto: string;
  canal: string;
  provincia: string;
  tipo: string;
  periodo: string;
  buscar: string;
};
const SIN_FILTROS: Filtros = {
  prioridad: '',
  estado: 'abiertos',
  asignado: '',
  contacto: '',
  canal: '',
  provincia: '',
  tipo: '',
  periodo: '',
  buscar: '',
};

// ---------------------------------------------------------------------------

type Sesion = { usuario: UsuarioSesion; permisos: Permisos };
type Vista = 'reclamos' | 'bi' | 'usuarios';

export default function Panel() {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [reportes, setReportes] = useState<ReporteBI[] | null>(null);
  const [generado, setGenerado] = useState('');
  const [error, setError] = useState('');
  const [vista, setVista] = useState<Vista>('reclamos');
  const [menu, setMenu] = useState(false); // menú de usuario (escritorio)
  const [cajon, setCajon] = useState(false); // menú hamburguesa (celular)
  const [cambiandoClave, setCambiandoClave] = useState(false);

  const cargarSesion = useCallback(async () => {
    const res = await fetch('/api/sesion', { cache: 'no-store' }).catch(() => null);
    setSesion(res?.ok ? await res.json() : null);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/panel', { cache: 'no-store' });
      if (res.status === 401) return setSesion(null);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setReportes(json.reportes);
      setGenerado(json.generado);
      setError('');
    } catch {
      setError('No se pudieron cargar los datos. Se reintentará automáticamente.');
    }
  }, []);

  useEffect(() => {
    cargarSesion();
  }, [cargarSesion]);

  useEffect(() => {
    if (!menu && !cajon) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenu(false);
      setCajon(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [menu, cajon]);

  useEffect(() => {
    if (!sesion) return;
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [sesion, cargar]);

  if (sesion === undefined) return <p className="cargando">Cargando…</p>;
  if (sesion === null) return <Login onEntrar={cargarSesion} />;

  const { usuario, permisos } = sesion;
  async function salir() {
    await fetch('/api/sesion', { method: 'DELETE' });
    setSesion(null);
    setReportes(null);
    setMenu(false);
    setCajon(false);
  }
  const vistas: [Vista, string][] = [
    ['reclamos', permisos.verTodos ? 'Reclamos' : 'Mis reclamos'],
    ...(permisos.verBI ? ([['bi', 'BI']] as [Vista, string][]) : []),
    ...(permisos.administrarUsuarios ? ([['usuarios', 'Usuarios']] as [Vista, string][]) : []),
  ];

  return (
    <>
      <header className="encabezado encabezado-fijo">
        <div className="contenedor panel-contenedor encabezado-panel">
          <img className="logo" src="/logo-white.svg" alt="ASSA Compañía de Seguros" width="152" height="36" />
          <nav className="vistas" aria-label="Secciones">
            {vistas.map(([id, titulo]) => (
              <button key={id} className={vista === id ? 'activa' : ''} onClick={() => setVista(id)}>
                {titulo}
              </button>
            ))}
          </nav>
          <div className="menu-usuario">
            <button className="operador-encabezado" onClick={() => setMenu(!menu)} aria-expanded={menu}>
              <span className="avatar" aria-hidden>
                {iniciales(usuario.nombre)}
              </span>
              <span>
                {usuario.nombre}
                <small>{ROLES.find((x) => x.id === usuario.rol)?.titulo}</small>
              </span>
            </button>
            {menu && (
              <div className="menu-desplegable" onMouseLeave={() => setMenu(false)}>
                <p className="sec">{usuario.correo}</p>
                <button
                  onClick={() => {
                    setMenu(false);
                    setCambiandoClave(true);
                  }}
                >
                  Cambiar mi clave
                </button>
                <button onClick={salir}>Salir</button>
              </div>
            )}
          </div>
          <button className="hamburguesa" onClick={() => setCajon(true)} aria-label="Abrir menú" aria-expanded={cajon}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>
      {cajon && (
        <div className="cajon-fondo" onClick={() => setCajon(false)}>
          <nav className="cajon" aria-label="Menú" onClick={(e) => e.stopPropagation()}>
            <div className="cajon-usuario">
              <span className="avatar grande" aria-hidden>
                {iniciales(usuario.nombre)}
              </span>
              <div>
                <strong>{usuario.nombre}</strong>
                <span>{ROLES.find((x) => x.id === usuario.rol)?.titulo}</span>
                <span className="sec">{usuario.correo}</span>
              </div>
              <button className="cerrar" onClick={() => setCajon(false)} aria-label="Cerrar menú">
                ×
              </button>
            </div>
            <div className="cajon-seccion">
              {vistas.map(([id, titulo]) => (
                <button
                  key={id}
                  className={vista === id ? 'activa' : ''}
                  onClick={() => {
                    setVista(id);
                    setCajon(false);
                    window.scrollTo({ top: 0 });
                  }}
                >
                  {titulo}
                </button>
              ))}
            </div>
            <div className="cajon-seccion">
              <button
                onClick={() => {
                  setCajon(false);
                  setCambiandoClave(true);
                }}
              >
                Cambiar mi clave
              </button>
              <button onClick={salir}>Salir</button>
            </div>
          </nav>
        </div>
      )}
      <main className="contenedor panel-contenedor">
        {error && <p className="error resumen">{error}</p>}
        {vista === 'usuarios' ? (
          <Usuarios usuario={usuario} />
        ) : reportes ? (
          <Tablero reportes={reportes} generado={generado} onActualizar={cargar} sesion={sesion} vista={vista} />
        ) : (
          <p className="cargando">Cargando…</p>
        )}
      </main>
      {cambiandoClave && <CambiarClave onCerrar={() => setCambiandoClave(false)} />}
    </>
  );
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

function CambiarClave({ onCerrar }: { onCerrar: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <div className="modal-fondo centrado" onClick={onCerrar}>
      <form
        className="tarjeta dialogo"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await fetch('/api/sesion', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ claveActual: actual, claveNueva: nueva }),
          }).catch(() => null);
          const json = res && !res.ok ? await res.json().catch(() => ({})) : {};
          setMensaje(res?.ok ? { ok: true, texto: 'Clave actualizada.' } : { ok: false, texto: json.error ?? 'No se pudo cambiar la clave.' });
          if (res?.ok) setTimeout(onCerrar, 1200);
        }}
      >
        <h2>Cambiar mi clave</h2>
        <div className="campo">
          <label htmlFor="clave-actual">Clave actual</label>
          <input
            id="clave-actual"
            type="password"
            autoComplete="current-password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            autoFocus
          />
        </div>
        <div className="campo">
          <label htmlFor="clave-nueva">Clave nueva</label>
          <input id="clave-nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          <span className="ayuda">Mínimo 10 caracteres.</span>
        </div>
        {mensaje && <p className={mensaje.ok ? 'aviso-ok' : 'error'}>{mensaje.texto}</p>}
        <div className="fila-form">
          <button className="boton compacto" disabled={!actual || nueva.length < 10}>
            Guardar
          </button>
          <button type="button" className="enlace" onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function Login({ onEntrar }: { onEntrar: () => void }) {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    const res = await fetch('/api/sesion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ correo, clave }),
    }).catch(() => null);
    setEnviando(false);
    if (res?.ok) return onEntrar();
    const json = res ? await res.json().catch(() => ({})) : {};
    setError(json.error ?? 'No se pudo iniciar sesión.');
  }

  return (
    <div className="login">
      <form className="tarjeta login-tarjeta" onSubmit={entrar}>
        <img src="/logo-blue.svg" alt="ASSA" width="152" height="36" />
        <h1>Gestión de reclamos</h1>
        <p>Acceso para el equipo de reclamos, analistas, ajustadores, comercial y canales.</p>
        <div className="campo">
          <label htmlFor="correo">Correo</label>
          <input id="correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} autoFocus />
        </div>
        <div className="campo">
          <label htmlFor="clave">Clave</label>
          <input id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="boton" disabled={enviando || !correo || !clave}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function filtrar(r: ReporteBI, f: Filtros, usuarioId: number) {
  const q = f.buscar.trim().toLowerCase();
  return (
    (!f.prioridad || r.prioridad === f.prioridad) &&
    (!f.estado || (f.estado === 'abiertos' ? esAbierto(r.estado) : r.estado === f.estado)) &&
    (!f.asignado ||
      (f.asignado === 'sin_asignar' ? !r.asignadoA : f.asignado === 'mios' ? r.asignadoUsuarioId === usuarioId : r.asignadoA === f.asignado)) &&
    (!f.contacto || (f.contacto === 'sin_contacto' ? !r.contactado : r.contactado)) &&
    (!f.canal || r.reportadoPor === f.canal) &&
    (!f.provincia || r.provincia === f.provincia) &&
    (!f.tipo || r.tipoPropiedad === f.tipo) &&
    (f.periodo !== 'hoy' || diaPanama(r.creadoEn) === diaPanama(new Date().toISOString())) &&
    (f.periodo !== '7d' || new Date(r.creadoEn).getTime() >= Date.now() - 7 * 86_400_000) &&
    (!q ||
      [r.numero, r.nombre, r.poliza, r.telefono, r.distrito, r.asignadoA ?? '', r.reportanteNombre ?? '', r.reportanteCodigo ?? ''].some((v) =>
        v.toLowerCase().includes(q),
      ))
  );
}

function Tablero({
  reportes,
  generado,
  onActualizar,
  sesion,
  vista,
}: {
  reportes: ReporteBI[];
  generado: string;
  onActualizar: () => Promise<void>;
  sesion: Sesion;
  vista: Vista;
}) {
  const { usuario, permisos } = sesion;
  const yo = usuario.id;
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [detalleNumero, setDetalleNumero] = useState<string | null>(null);
  const detalle = reportes.find((r) => r.numero === detalleNumero) ?? null;
  const conocidos = useMemo(() => [...new Set(reportes.map((r) => r.asignadoA).filter((n): n is string => !!n))].sort(), [reportes]);
  const tip = useTooltip();

  const filtrados = useMemo(
    () =>
      reportes
        .filter((r) => filtrar(r, filtros, yo))
        .sort((a, b) => ORDEN[a.prioridad] - ORDEN[b.prioridad] || (b.costo ?? 0) - (a.costo ?? 0) || a.creadoEn.localeCompare(b.creadoEn)),
    [reportes, filtros, yo],
  );

  // El gráfico de estados ignora el filtro de estado para mostrar el embudo completo.
  const porEstado = useMemo(() => {
    const base = reportes.filter((r) => filtrar(r, { ...filtros, estado: '' }, yo));
    return ESTADOS.map((e) => ({ etiqueta: e.titulo, valor: base.filter((r) => r.estado === e.id).length }));
  }, [reportes, filtros, yo]);

  const total = filtrados.length;
  const cuenta = (fn: (r: ReporteBI) => boolean) => filtrados.filter(fn).length;
  const porPrioridad = Object.fromEntries(PRIORIDADES.map((p) => [p.id, cuenta((r) => r.prioridad === p.id)])) as Record<Prioridad, number>;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)} %` : '—');
  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(SIN_FILTROS);
  const filtrosActivos = (Object.keys(SIN_FILTROS) as (keyof Filtros)[]).filter((k) => k !== 'buscar' && filtros[k] !== SIN_FILTROS[k]).length;

  return (
    <>
      <div className="panel-titulo">
        <div>
          <h1>{vista === 'bi' ? 'BI de reclamos por sismo' : permisos.verTodos ? 'Reclamos por sismo' : 'Mis reclamos asignados'}</h1>
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

      <div className="barra-filtros">
        <input
          type="search"
          placeholder="Buscar número, nombre, póliza, teléfono, corredor…"
          value={filtros.buscar}
          onChange={(e) => setFiltros({ ...filtros, buscar: e.target.value })}
          aria-label="Buscar"
        />
        <button
          className={'boton-filtros' + (filtrosAbiertos ? ' activo' : '')}
          onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
          aria-expanded={filtrosAbiertos}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Filtros
          {filtrosActivos > 0 && <span className="contador-filtros">{filtrosActivos}</span>}
        </button>
      </div>

      <div className={'filtros' + (filtrosAbiertos ? ' abiertos' : '')} role="group" aria-label="Filtros">
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
          <option value="">Todas las fases</option>
          {ESTADOS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.titulo}
            </option>
          ))}
        </select>
        <select value={filtros.asignado} onChange={(e) => setFiltros({ ...filtros, asignado: e.target.value })} aria-label="Asignado a">
          <option value="">Cualquier responsable</option>
          <option value="mios">Mis casos</option>
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
        <select value={filtros.canal} onChange={(e) => setFiltros({ ...filtros, canal: e.target.value })} aria-label="Canal de ingreso">
          <option value="">Cualquier canal de ingreso</option>
          {REPORTANTES.map((x) => (
            <option key={x.id} value={x.id}>
              Reportado por {x.titulo.toLowerCase()}
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

        {hayFiltros && (
          <button className="enlace" onClick={() => setFiltros(SIN_FILTROS)}>
            Limpiar filtros
          </button>
        )}
      </div>

      {!reportes.length ? (
        <div className="tarjeta vacio">
          <h2>Aún no hay reportes</h2>
          <p>
            {permisos.verTodos
              ? 'Cuando lleguen reclamos por el formulario, aparecerán aquí clasificados por prioridad.'
              : 'Aún no tiene reclamos asignados. Aparecerán aquí cuando un supervisor o analista se los asigne.'}
          </p>
        </div>
      ) : (
        <>
          <section className="kpis">
            <div className="kpi kpi-hero">
              <span className="kpi-etiqueta">Reportes</span>
              <span className="kpi-valor">{fmtNum.format(total)}</span>
              <span className="kpi-nota">{hayFiltros ? `de ${fmtNum.format(reportes.length)} en total` : 'en total'}</span>
            </div>
            {vista === 'bi' &&
              PRIORIDADES.map((p) => (
                <div key={p.id} className={`kpi kpi-prioridad kpi-${p.id}`}>
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
            {vista === 'reclamos' && (
              <div className="kpi">
                <span className="kpi-etiqueta">Asignados a mí</span>
                <span className="kpi-valor">{fmtNum.format(cuenta((r) => r.asignadoUsuarioId === yo))}</span>
                <span className="kpi-nota">con los filtros actuales</span>
              </div>
            )}
            {vista === 'bi' && (
              <div className="kpi">
                <span className="kpi-etiqueta">Probablemente superan el deducible</span>
                <span className="kpi-valor">{fmtNum.format(cuenta((r) => (r.costo ?? 0) >= DEDUCIBLE))}</span>
                <span className="kpi-nota">
                  costo estimado de {DEDUCIBLE} % o más · {pct(cuenta((r) => (r.costo ?? 0) >= DEDUCIBLE))}
                </span>
              </div>
            )}
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
              <span className="kpi-etiqueta">Esperando información</span>
              <span className="kpi-valor">{fmtNum.format(cuenta((r) => r.estado === 'esperando_info'))}</span>
              <span className="kpi-nota">pendientes del asegurado o corredor</span>
            </div>
            {vista === 'bi' && (
              <>
                <div className="kpi">
                  <span className="kpi-etiqueta">Reserva</span>
                  <span className="kpi-valor">{fmtMontoCorto(sumaMontos(filtrados, 'reserva'))}</span>
                  <span className="kpi-nota">{fmtNum.format(cuenta((r) => r.coberturas.length > 0))} reclamos con análisis</span>
                </div>
                <div className="kpi">
                  <span className="kpi-etiqueta">Pagado</span>
                  <span className="kpi-valor">{fmtMontoCorto(sumaMontos(filtrados, 'pagado'))}</span>
                  <span className="kpi-nota">{fmtNum.format(cuenta((r) => r.estado === 'pagado'))} reclamos pagados</span>
                </div>
              </>
            )}
          </section>

          {vista === 'bi' && (
            <section className="graficos">
              <Tarjeta titulo="Reportes por día" subtitulo="Por fecha de recepción, según prioridad" ancho>
                <Leyenda />
                <ColumnasPorDia reportes={filtrados} tip={tip} />
              </Tarjeta>

              <h2 className="bloque-titulo">Gestión</h2>
              <Tarjeta titulo="Reclamos por fase" subtitulo="Con los filtros actuales, sin importar el filtro de fase">
                <BarrasSimples filas={porEstado} color="var(--azul)" tip={tip} vacio="Sin casos" />
              </Tarjeta>

              <Tarjeta titulo="Días promedio en la fase actual" subtitulo="Reclamos abiertos">
                <BarrasSimples
                  filas={ESTADOS.filter((e) => e.abierto)
                    .map((e) => {
                      const casos = filtrados.filter((r) => r.estado === e.id);
                      const promedio = casos.length ? casos.reduce((s, r) => s + diasDesde(r.faseDesde), 0) / casos.length : 0;
                      return { etiqueta: e.titulo, valor: Math.round(promedio * 10) / 10, casos: casos.length };
                    })
                    .filter((f) => f.casos > 0)}
                  color="var(--azul)"
                  unidad="días promedio"
                  tip={tip}
                  vacio="Sin reclamos abiertos"
                />
              </Tarjeta>

              <Tarjeta titulo="Canal de ingreso" subtitulo="Quién reportó">
                <BarrasSimples
                  filas={REPORTANTES.map((x) => ({ etiqueta: x.titulo, valor: cuenta((r) => r.reportadoPor === x.id) })).filter((f) => f.valor)}
                  color="var(--azul)"
                  tip={tip}
                />
              </Tarjeta>

              <Tarjeta titulo="Corredores con más reclamos" subtitulo="Top 10">
                <BarrasSimples
                  filas={contarListas(
                    filtrados.filter((r) => r.reportadoPor === 'corredor' && r.reportanteNombre),
                    (r) => [r.reportanteNombre!],
                  )
                    .slice(0, 10)
                    .map(([etiqueta, n]) => ({ etiqueta, valor: n }))}
                  color="var(--azul)"
                  tip={tip}
                  vacio="Ningún reclamo ingresado por corredores"
                />
              </Tarjeta>

              <h2 className="bloque-titulo">Coberturas y causas</h2>
              <Tarjeta titulo="Montos por cobertura" subtitulo="Según el análisis de los analistas, en dólares" ancho>
                <TablaCoberturas reportes={filtrados} />
              </Tarjeta>

              <Tarjeta titulo="Coberturas afectadas" subtitulo="Reclamos con cada cobertura">
                <BarrasSimples
                  filas={contarListas(filtrados, (r) => r.coberturas.map((c) => c.id)).map(([id, n]) => ({
                    etiqueta: tituloDe(COBERTURAS, id),
                    valor: n,
                  }))}
                  color="var(--azul)"
                  tip={tip}
                  vacio="Aún no hay coberturas registradas"
                />
              </Tarjeta>

              <Tarjeta titulo="Causas" subtitulo="Definidas por el analista">
                <BarrasSimples
                  filas={contarListas(filtrados, (r) => [r.causa ?? 'sin_definir']).map(([id, n]) => ({
                    etiqueta: id === 'sin_definir' ? 'Sin definir' : tituloDe(CAUSAS, id),
                    valor: n,
                  }))}
                  color="var(--azul)"
                  tip={tip}
                />
              </Tarjeta>

              <h2 className="bloque-titulo">Daños y prioridad</h2>
              <Tarjeta titulo="Reglas de prioridad activadas" subtitulo="Reportes que cumplen cada regla (un reporte puede cumplir varias)">
                <ReglasActivadas reportes={filtrados} tip={tip} />
              </Tarjeta>

              <Tarjeta titulo="Reportes por provincia" subtitulo="Según prioridad">
                <Leyenda />
                <BarrasApiladas filas={agrupar(filtrados, (r) => r.provincia)} tip={tip} vacio="Sin reportes con estos filtros" />
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
                    filtrados.filter((r) => (r.costo ?? 0) >= DEDUCIBLE),
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
          )}

          {vista === 'reclamos' && (
            <Tarjeta
              titulo="Cola de atención"
              subtitulo={
                permisos.verCosto
                  ? 'Ordenada por prioridad; dentro de cada prioridad, por mayor gasto estimado y luego por antigüedad'
                  : 'Ordenada por prioridad y antigüedad'
              }
              ancho
            >
              <Cola reportes={filtrados} verCosto={permisos.verCosto} onAbrir={(r) => setDetalleNumero(r.numero)} />
            </Tarjeta>
          )}
        </>
      )}

      {vista === 'bi' && <ReglasTexto />}

      {tip.elemento}
      {detalle && (
        <Caso
          key={detalle.numero}
          r={detalle}
          usuario={usuario}
          permisos={permisos}
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

type Monto = 'reclamado' | 'reserva' | 'pagado';
const sumaMontos = (reportes: ReporteBI[], campo: Monto) => reportes.reduce((s, r) => s + r.coberturas.reduce((t, c) => t + (c[campo] || 0), 0), 0);
const fmtUsd = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtMontoCorto = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toLocaleString('es-PA', { maximumFractionDigits: 1 })} M`
    : n >= 10_000
      ? `$${Math.round(n / 1000).toLocaleString('es-PA')} mil`
      : fmtUsd.format(n);

function TablaCoberturas({ reportes }: { reportes: ReporteBI[] }) {
  const filas = COBERTURAS.map((c) => {
    const lista = reportes.flatMap((r) => r.coberturas.filter((x) => x.id === c.id));
    return {
      titulo: c.titulo,
      reclamos: lista.length,
      reclamado: lista.reduce((s, x) => s + x.reclamado, 0),
      reserva: lista.reduce((s, x) => s + x.reserva, 0),
      pagado: lista.reduce((s, x) => s + x.pagado, 0),
    };
  }).filter((f) => f.reclamos > 0);
  if (!filas.length)
    return <p className="vacio-grafico">Aún no hay coberturas registradas. Los analistas las registran en la pestaña Análisis de cada caso.</p>;
  const total = (k: Monto) => filas.reduce((s, f) => s + f[k], 0);
  return (
    <div className="scroll-x">
      <table className="cola tabla-montos">
        <thead>
          <tr>
            <th>Cobertura</th>
            <th className="num">Reclamos</th>
            <th className="num">Reclamado</th>
            <th className="num">Reserva</th>
            <th className="num">Pagado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.titulo}>
              <td>{f.titulo}</td>
              <td className="num">{fmtNum.format(f.reclamos)}</td>
              <td className="num">{fmtUsd.format(f.reclamado)}</td>
              <td className="num">{fmtUsd.format(f.reserva)}</td>
              <td className="num">{fmtUsd.format(f.pagado)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{fmtNum.format(filas.reduce((s, f) => s + f.reclamos, 0))}</td>
            <td className="num">{fmtUsd.format(total('reclamado'))}</td>
            <td className="num">{fmtUsd.format(total('reserva'))}</td>
            <td className="num">{fmtUsd.format(total('pagado'))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
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
        <div
          key={f.etiqueta}
          className="barra-fila marca-hover"
          {...tip.props(<TipFilas titulo={f.etiqueta} filas={[{ nombre: unidad, valor: f.valor }]} />)}
        >
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
              <div
                key={f.etiqueta}
                className="barra-fila marca-hover"
                {...tip.props(<TipFilas titulo={f.etiqueta} filas={[{ nombre: 'reportes', valor: f.valor }]} />)}
              >
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

function Cola({ reportes, verCosto, onAbrir }: { reportes: ReporteBI[]; verCosto: boolean; onAbrir: (r: ReporteBI) => void }) {
  const [pagina, setPagina] = useState(0);
  const movil = useEsMovil();
  useEffect(() => setPagina(0), [reportes]);
  if (!reportes.length) return <p className="vacio-grafico">Sin reportes con estos filtros</p>;
  const paginas = Math.ceil(reportes.length / POR_PAGINA);
  const visibles = reportes.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const paginacion = paginas > 1 && (
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
  );

  // En el celular, cada reclamo es una tarjeta en vez de una fila de tabla.
  if (movil) {
    return (
      <>
        <ul className="lista-reclamos">
          {visibles.map((r) => (
            <li key={r.numero}>
              <button className="tarjeta-reclamo" onClick={() => onAbrir(r)}>
                <span className="tr-cabecera">
                  <Insignia prioridad={r.prioridad} />
                  <InsigniaEstado estado={r.estado} />
                  <span className="tr-numero">{r.numero}</span>
                </span>
                <span className="tr-nombre">{r.nombre}</span>
                <span className="tr-detalle">
                  {r.distrito}, {r.provincia} · {r.tipoPropiedad}
                  {verCosto && r.costo != null && <> · {fmtPct(r.costo)}</>}
                </span>
                <span className="tr-pie">
                  <span>{r.asignadoA ?? <span className="sin-asignar">Sin asignar</span>}</span>
                  <span>
                    {r.ultimoContacto ? (
                      `Contacto ${fmtFecha.format(new Date(r.ultimoContacto))}`
                    ) : (
                      <span className="sin-contacto">Sin contactar</span>
                    )}{' '}
                    · {diasDesde(r.creadoEn)} d
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {paginacion}
      </>
    );
  }

  return (
    <>
      <div className="scroll-x">
        <table className="cola">
          <thead>
            <tr>
              <th>Prioridad</th>
              {verCosto && <th className="num">Costo est.</th>}
              <th>Número</th>
              <th>Estado</th>
              <th>Responsable</th>
              <th className="num">Días</th>
              <th>Último contacto</th>
              <th>Asegurado</th>
              <th>Ubicación</th>
              {verCosto && <th>Motivos</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.numero} onClick={() => onAbrir(r)} onKeyDown={(e) => e.key === 'Enter' && onAbrir(r)} tabIndex={0}>
                <td>
                  <Insignia prioridad={r.prioridad} />
                </td>
                {verCosto && <td className="num">{fmtPct(r.costo ?? 0)}</td>}
                <td className="mono">
                  {r.numero}
                  {r.pendiente && (
                    <span className="pendiente" title="Guardado en respaldo; se cargará a la base de datos en el próximo respaldo diario">
                      respaldo
                    </span>
                  )}
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
                <td className="celda-asegurado">
                  <div>{r.nombre}</div>
                  <div className="sec">
                    {r.poliza}
                    {r.telefono && <> · {r.telefono}</>}
                  </div>
                  {r.reportadoPor !== 'asegurado' && (
                    <div className="sec">
                      vía {tituloDe(REPORTANTES, r.reportadoPor).toLowerCase()}: {r.reportanteNombre}
                    </div>
                  )}
                </td>
                <td className="celda-ubicacion">
                  <div>{r.distrito}</div>
                  <div className="sec">
                    {r.provincia} · {r.tipoPropiedad}
                  </div>
                </td>
                {verCosto && (
                  <td className="motivos">
                    {r.motivos.length ? (
                      r.motivos.map((m) => (
                        <span key={m} className={`chip-motivo chip-${REGLA[m]?.nivel}`} title={REGLA[m]?.titulo}>
                          <span aria-hidden>{ICONO_NIVEL[REGLA[m]?.nivel ?? 'baja']}</span> {REGLA[m]?.corto ?? m}
                        </span>
                      ))
                    ) : (
                      <span className="sec">Ninguno</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginacion}
    </>
  );
}

function ReglasTexto() {
  const costos = Object.entries(COSTO_DANO).sort((a, b) => b[1] - a[1]);
  return (
    <details className="tarjeta reglas-texto">
      <summary>Cómo se asigna la prioridad</summary>
      <p>
        La prioridad refleja el <strong>gasto estimado</strong> y la necesidad de resolver rápido, no el riesgo personal del asegurado. Se recalcula
        con estas reglas cada vez que se abre el panel.
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
        Si no aplica ninguna regla, queda en <strong>prioridad baja</strong>. La habitabilidad declarada solo cuenta si los daños la respaldan:{' '}
        <em>no habitable</em> requiere daño estructural, en techo o en todo el inmueble; <em>parcialmente</em> requiere además grietas abiertas, cielo
        raso o tuberías. Los riesgos de seguridad se muestran como aviso pero no cambian la prioridad.
      </p>
      <h3>Costo estimado (% de la suma asegurada)</h3>
      <p>
        Suma del costo típico de reparar cada daño en un área × extensión (un área ×{FACTOR_EXTENSION.puntual}, varias ×{FACTOR_EXTENSION.varias},
        todo el inmueble ×{FACTOR_EXTENSION.total}) + operación del negocio en comercial e industrial (detenida +{COSTO_OPERACION.detenida} %, parcial
        +{COSTO_OPERACION.parcial} %). Menos de {DEDUCIBLE} % (el deducible residencial) es cierre rápido; de {DEDUCIBLE} % a {UMBRAL_ALTA} % es
        media; {UMBRAL_ALTA} % o más es alta. Referencia: vivienda de unos B/.150,000; en inmuebles de menor valor el porcentaje real es mayor.
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
    ['motivo_declinacion', (r) => tituloDe(TODOS_LOS_MOTIVOS, r.motivoCierre)],
    ['asignado_a', (r) => r.asignadoA],
    ['fecha_inspeccion', (r) => r.fechaInspeccion],
    ['contactado', (r) => (r.contactado ? 'sí' : 'no')],
    ['ultimo_contacto', (r) => r.ultimoContacto],
    ['comunicaciones', (r) => r.comunicaciones],
    ['documentos', (r) => r.documentos],
    ['dias_en_fase', (r) => diasDesde(r.faseDesde)],
    ['reportado_por', (r) => tituloDe(REPORTANTES, r.reportadoPor)],
    ['reportante', (r) => r.reportanteNombre],
    ['reportante_codigo', (r) => r.reportanteCodigo],
    ['reportante_correo', (r) => r.reportanteCorreo],
    ['causa', (r) => tituloDe(CAUSAS, r.causa)],
    ['coberturas', (r) => r.coberturas.map((c) => tituloDe(COBERTURAS, c.id)).join(' | ')],
    ['reclamado_usd', (r) => r.coberturas.reduce((s, c) => s + c.reclamado, 0)],
    ['reserva_usd', (r) => r.coberturas.reduce((s, c) => s + c.reserva, 0)],
    ['pagado_usd', (r) => r.coberturas.reduce((s, c) => s + c.pagado, 0)],
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
