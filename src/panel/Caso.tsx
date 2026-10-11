// Ficha de un caso: gestión (estado, asignación, notas), comunicaciones con
// el asegurado, datos del reporte e historial.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ReporteBI } from '../../api/panel';
import {
  CANALES,
  ESTADOS,
  MOTIVOS_CIERRE,
  PLANTILLAS,
  RESULTADOS_CONTACTO,
  llenarPlantilla,
  tituloDe,
} from '../../shared/flujo.js';
import {
  ICONO_NIVEL,
  Insignia,
  InsigniaEstado,
  NOMBRE_DANO,
  NOMBRE_EXT,
  NOMBRE_HAB,
  NOMBRE_OPE,
  NOMBRE_RIESGO,
  REGLA,
  diasDesde,
  fmtFechaHora,
  fmtPct,
} from './comun';

type Evento = { id: number; creado_en: string; autor: string; tipo: string; datos: Record<string, string> };
type Pestana = 'gestion' | 'comunicacion' | 'reporte' | 'historial';

const fmtDia = new Intl.DateTimeFormat('es-PA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const soloDigitos = (tel: string) => tel.replace(/\D/g, '').replace(/^507/, '');

export default function Caso({
  r,
  operador,
  conocidos,
  onCambiarOperador,
  onCerrar,
  onActualizado,
}: {
  r: ReporteBI;
  operador: string;
  conocidos: string[];
  onCambiarOperador: () => void;
  onCerrar: () => void;
  onActualizado: () => Promise<void>;
}) {
  const [pestana, setPestana] = useState<Pestana>(r.pendiente ? 'reporte' : 'gestion');
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargarEventos = useCallback(async () => {
    if (!r.id) return setEventos([]);
    const res = await fetch(`/api/gestion?id=${r.id}`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setEventos((await res.json()).eventos);
  }, [r.id]);

  useEffect(() => {
    cargarEventos();
  }, [cargarEventos]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  async function accion(cuerpo: Record<string, unknown>, exito: string) {
    if (!operador) return onCambiarOperador();
    setEnviando(true);
    setAviso(null);
    const res = await fetch('/api/gestion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: r.id, autor: operador, ...cuerpo }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setEnviando(false);
    if (res?.ok) setAviso({ tipo: 'ok', texto: exito });
    else setAviso({ tipo: 'error', texto: json.error ?? 'No se pudo guardar. Revise su conexión e intente de nuevo.' });
    await Promise.all([cargarEventos(), onActualizado()]);
    return !!res?.ok;
  }

  const pestanas: [Pestana, string][] = [
    ['gestion', 'Gestión'],
    ['comunicacion', `Comunicación${r.comunicaciones ? ` (${r.comunicaciones})` : ''}`],
    ['reporte', 'Reporte'],
    ['historial', 'Historial'],
  ];

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <aside className="modal" role="dialog" aria-modal="true" aria-label={`Caso ${r.numero}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-cabecera">
          <div>
            <div className="insignias">
              <Insignia prioridad={r.prioridad} />
              <InsigniaEstado estado={r.estado} />
            </div>
            <h2>{r.numero}</h2>
            <p className="sec">
              {r.nombre} · {r.distrito}, {r.provincia} · costo estimado {fmtPct(r.costo)}
              <br />
              Recibido hace {diasDesde(r.creadoEn)} días · {r.asignadoA ? `asignado a ${r.asignadoA}` : 'sin asignar'}
            </p>
          </div>
          <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="pestanas" role="tablist">
          {pestanas.map(([id, titulo]) => (
            <button
              key={id}
              role="tab"
              aria-selected={pestana === id}
              className={pestana === id ? 'activa' : ''}
              onClick={() => {
                setPestana(id);
                setAviso(null);
              }}
            >
              {titulo}
            </button>
          ))}
        </div>

        {aviso && <p className={aviso.tipo === 'ok' ? 'aviso-ok' : 'error resumen'}>{aviso.texto}</p>}

        {r.pendiente && pestana !== 'reporte' ? (
          <p className="aviso-gestion">
            Este reporte está guardado en el respaldo y se cargará a la base de datos en el próximo respaldo diario. Podrá
            gestionarlo cuando aparezca con número TRM.
          </p>
        ) : pestana === 'gestion' ? (
          <Gestion r={r} operador={operador} conocidos={conocidos} enviando={enviando} accion={accion} onCambiarOperador={onCambiarOperador} />
        ) : pestana === 'comunicacion' ? (
          <Comunicacion r={r} operador={operador} eventos={eventos} enviando={enviando} accion={accion} />
        ) : pestana === 'reporte' ? (
          <Reporte r={r} />
        ) : (
          <Historial r={r} eventos={eventos} />
        )}
      </aside>
    </div>
  );
}

type Accion = (cuerpo: Record<string, unknown>, exito: string) => Promise<boolean | void>;

function Gestion({
  r,
  operador,
  conocidos,
  enviando,
  accion,
  onCambiarOperador,
}: {
  r: ReporteBI;
  operador: string;
  conocidos: string[];
  enviando: boolean;
  accion: Accion;
  onCambiarOperador: () => void;
}) {
  const [estado, setEstado] = useState(r.estado);
  const [motivo, setMotivo] = useState(r.motivoCierre ?? (r.prioridad === 'rapido' ? 'bajo_deducible' : ''));
  const [fecha, setFecha] = useState(r.fechaInspeccion ?? '');
  const [asignado, setAsignado] = useState(r.asignadoA ?? '');
  const [nota, setNota] = useState('');

  // Si el caso cambia (por esta u otra persona), se reflejan los valores nuevos
  // sin borrar lo que se está editando en el otro campo.
  useEffect(() => setEstado(r.estado), [r.estado]);
  useEffect(() => setAsignado(r.asignadoA ?? ''), [r.asignadoA]);

  const faltaDato = (estado === 'cerrado' && !motivo) || (estado === 'inspeccion_programada' && !fecha);

  return (
    <div className="gestion">
      <p className="operador">
        Trabajando como <strong>{operador || 'sin nombre'}</strong> ·{' '}
        <button className="enlace" onClick={onCambiarOperador}>
          cambiar
        </button>
      </p>

      <section className="bloque">
        <h3>Estado del caso</h3>
        <div className="fila-form">
          <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
            {ESTADOS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.titulo}
              </option>
            ))}
          </select>
          {estado === 'cerrado' && (
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo de cierre">
              <option value="">Motivo de cierre…</option>
              {MOTIVOS_CIERRE.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titulo}
                </option>
              ))}
            </select>
          )}
          {estado === 'inspeccion_programada' && (
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha de inspección" />
          )}
          <button
            className="boton compacto"
            disabled={enviando || estado === r.estado || faltaDato}
            onClick={() =>
              accion(
                { tipo: 'estado', estado, estadoAnterior: r.estado, motivoCierre: motivo, fechaInspeccion: fecha },
                `Estado actualizado a "${tituloDe(ESTADOS, estado)}".`,
              )
            }
          >
            Guardar estado
          </button>
        </div>
        {r.estado === 'cerrado' && r.motivoCierre && <p className="sec">Cerrado: {tituloDe(MOTIVOS_CIERRE, r.motivoCierre)}</p>}
        {r.fechaInspeccion && r.estado !== 'cerrado' && <p className="sec">Inspección: {fmtDia.format(new Date(r.fechaInspeccion))}</p>}
      </section>

      <section className="bloque">
        <h3>Asignado a</h3>
        <div className="fila-form">
          <input list="conocidos" value={asignado} onChange={(e) => setAsignado(e.target.value)} placeholder="Nombre del analista" aria-label="Asignado a" />
          <datalist id="conocidos">
            {conocidos.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {operador && asignado !== operador && (
            <button className="enlace" onClick={() => setAsignado(operador)}>
              Asignarme
            </button>
          )}
          <button
            className="boton compacto"
            disabled={enviando || asignado.trim() === (r.asignadoA ?? '')}
            onClick={() =>
              accion(
                { tipo: 'asignacion', asignadoA: asignado.trim(), asignadoAnterior: r.asignadoA ?? '' },
                asignado.trim() ? `Caso asignado a ${asignado.trim()}.` : 'Caso sin asignar.',
              )
            }
          >
            Guardar
          </button>
        </div>
      </section>

      <section className="bloque">
        <h3>Nota interna</h3>
        <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Visible solo para el equipo" maxLength={2000} />
        <button
          className="boton compacto"
          disabled={enviando || !nota.trim()}
          onClick={async () => {
            if (await accion({ tipo: 'nota', texto: nota }, 'Nota agregada.')) setNota('');
          }}
        >
          Agregar nota
        </button>
      </section>
    </div>
  );
}

function Comunicacion({
  r,
  operador,
  eventos,
  enviando,
  accion,
}: {
  r: ReporteBI;
  operador: string;
  eventos: Evento[] | null;
  enviando: boolean;
  accion: Accion;
}) {
  const [plantilla, setPlantilla] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [canal, setCanal] = useState('');
  const [resultado, setResultado] = useState('');
  const [copiado, setCopiado] = useState(false);

  const valores = useMemo(
    () => ({
      nombre: r.nombre.split(/\s+/)[0],
      numero: r.numero,
      operador: operador || 'el equipo de reclamos',
      ubicacion: `${r.distrito}, ${r.provincia}`,
      fecha_inspeccion: r.fechaInspeccion ? fmtDia.format(new Date(r.fechaInspeccion)) : '[fecha]',
    }),
    [r, operador],
  );
  const asunto = llenarPlantilla(PLANTILLAS.find((p) => p.id === plantilla)?.asunto ?? `ASSA · Su reporte {numero}`, valores);
  const tel = soloDigitos(r.telefono);
  const comunicaciones = (eventos ?? []).filter((e) => e.tipo === 'comunicacion').reverse();

  return (
    <div className="gestion">
      <section className="bloque">
        <h3>Contacto</h3>
        <p className="contacto">
          <a href={`tel:+507${tel}`}>+507 {r.telefono}</a> · <a href={`mailto:${r.correo}`}>{r.correo}</a>
        </p>
      </section>

      <section className="bloque">
        <h3>Mensaje</h3>
        <select
          value={plantilla}
          onChange={(e) => {
            setPlantilla(e.target.value);
            const p = PLANTILLAS.find((x) => x.id === e.target.value);
            setMensaje(p ? llenarPlantilla(p.texto, valores) : '');
          }}
          aria-label="Plantilla"
        >
          <option value="">Elegir plantilla…</option>
          {PLANTILLAS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titulo}
            </option>
          ))}
        </select>
        <textarea rows={6} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Escriba o elija una plantilla. Puede editar el texto antes de enviarlo." />
        <div className="acciones-mensaje">
          <a
            className="boton compacto secundario"
            href={`https://wa.me/507${tel}?text=${encodeURIComponent(mensaje)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => setCanal('whatsapp')}
          >
            Abrir WhatsApp
          </a>
          <a
            className="boton compacto secundario"
            href={`mailto:${r.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`}
            onClick={() => setCanal('correo')}
          >
            Abrir correo
          </a>
          <button
            className="boton compacto secundario"
            disabled={!mensaje}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(mensaje);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              } catch {
                // El navegador no permitió copiar.
              }
            }}
          >
            {copiado ? 'Copiado ✓' : 'Copiar texto'}
          </button>
        </div>
      </section>

      <section className="bloque">
        <h3>Registrar contacto</h3>
        <p className="sec">Después de llamar o enviar el mensaje, registre el resultado para que todo el equipo lo vea.</p>
        <div className="fila-form">
          <select value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Canal">
            <option value="">Canal…</option>
            {CANALES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titulo}
              </option>
            ))}
          </select>
          <select value={resultado} onChange={(e) => setResultado(e.target.value)} aria-label="Resultado">
            <option value="">Resultado…</option>
            {RESULTADOS_CONTACTO.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titulo}
              </option>
            ))}
          </select>
          <button
            className="boton compacto"
            disabled={enviando || !canal || !resultado}
            onClick={async () => {
              const ok = await accion({ tipo: 'comunicacion', canal, resultado, texto: mensaje, plantilla }, 'Contacto registrado.');
              if (ok) {
                setResultado('');
                setMensaje('');
                setPlantilla('');
              }
            }}
          >
            Registrar
          </button>
        </div>
      </section>

      <section className="bloque">
        <h3>Contactos anteriores</h3>
        {!eventos ? (
          <p className="sec">Cargando…</p>
        ) : !comunicaciones.length ? (
          <p className="sec">Todavía no hay contactos registrados.</p>
        ) : (
          <ul className="linea-tiempo">
            {comunicaciones.map((e) => (
              <ItemEvento key={e.id} e={e} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Reporte({ r }: { r: ReporteBI }) {
  const dato = (etiqueta: string, valor: ReactNode) => (
    <div className="dato">
      <dt>{etiqueta}</dt>
      <dd>{valor || '—'}</dd>
    </div>
  );
  return (
    <>
      <h3>Motivos de prioridad</h3>
      {r.motivos.length ? (
        <ul className="lista-motivos">
          {r.motivos.map((m) => (
            <li key={m} className={REGLA[m]?.nivel === 'aviso' ? 'motivo-aviso' : undefined}>
              <span className={`marca marca-${REGLA[m]?.nivel}`} aria-hidden>
                {ICONO_NIVEL[REGLA[m]?.nivel ?? 'baja']}
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
        {dato('Teléfono', r.telefono)}
        {dato('Correo', r.correo)}
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
    </>
  );
}

function Historial({ r, eventos }: { r: ReporteBI; eventos: Evento[] | null }) {
  if (!eventos) return <p className="sec">Cargando…</p>;
  return (
    <ul className="linea-tiempo">
      {[...eventos].reverse().map((e) => (
        <ItemEvento key={e.id} e={e} />
      ))}
      <li>
        <span className="lt-fecha">{fmtFechaHora.format(new Date(r.creadoEn))}</span>
        <span className="lt-texto">
          <strong>Reporte recibido</strong> desde el formulario web
        </span>
      </li>
    </ul>
  );
}

function ItemEvento({ e }: { e: Evento }) {
  const d = e.datos;
  let texto: ReactNode;
  if (e.tipo === 'estado') {
    texto = (
      <>
        Cambió el estado a <strong>{tituloDe(ESTADOS, d.a)}</strong>
        {d.motivoCierre && <> · {tituloDe(MOTIVOS_CIERRE, d.motivoCierre)}</>}
        {d.fechaInspeccion && <> · inspección {fmtDia.format(new Date(d.fechaInspeccion))}</>}
      </>
    );
  } else if (e.tipo === 'asignacion') {
    texto = d.a ? (
      <>
        Asignó el caso a <strong>{d.a}</strong>
      </>
    ) : (
      'Quitó la asignación'
    );
  } else if (e.tipo === 'comunicacion') {
    texto = (
      <>
        <strong>{tituloDe(CANALES, d.canal)}</strong> · {tituloDe(RESULTADOS_CONTACTO, d.resultado)}
        {d.plantilla && <> · plantilla “{tituloDe(PLANTILLAS, d.plantilla)}”</>}
        {d.texto && <span className="lt-mensaje">{d.texto}</span>}
      </>
    );
  } else {
    texto = (
      <>
        Nota: <span className="lt-mensaje">{d.texto}</span>
      </>
    );
  }
  return (
    <li>
      <span className="lt-fecha">
        {fmtFechaHora.format(new Date(e.creado_en))} · {e.autor}
      </span>
      <span className="lt-texto">{texto}</span>
    </li>
  );
}
