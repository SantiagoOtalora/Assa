// Ficha de un caso: gestión (fase, asignación, notas), análisis (causa y
// coberturas), documentos, comunicaciones, datos del reporte e historial.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ReporteBI } from '../../api/panel';
import { upload } from '@vercel/blob/client';
import {
  CANALES,
  CAUSAS,
  COBERTURAS,
  ESTADOS,
  MAX_BYTES_DOCUMENTO,
  MOTIVOS_DECLINACION,
  PLANTILLAS,
  REPORTANTES,
  RESULTADOS_CONTACTO,
  TIPOS_ARCHIVO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  TODOS_LOS_MOTIVOS,
  llenarPlantilla,
  tituloDe,
  tituloEstado,
  type CoberturaAfectada,
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
type Pestana = 'gestion' | 'analisis' | 'documentos' | 'comunicacion' | 'reporte' | 'historial';

const fmtDia = new Intl.DateTimeFormat('es-PA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const soloDigitos = (tel: string) => tel.replace(/\D/g, '').replace(/^507/, '');
const fmtMonto = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtTamano = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

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
    ['analisis', 'Análisis'],
    ['documentos', `Documentos${r.documentos ? ` (${r.documentos})` : ''}`],
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
        ) : pestana === 'analisis' ? (
          <Analisis key={r.analisisVersion} r={r} enviando={enviando} accion={accion} />
        ) : pestana === 'documentos' ? (
          <Documentos r={r} eventos={eventos} enviando={enviando} accion={accion} onError={(texto) => setAviso({ tipo: 'error', texto })} />
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
  const fechaInicial = r.fechaInspeccion ?? '';
  const [fecha, setFecha] = useState(fechaInicial);
  const [asignado, setAsignado] = useState(r.asignadoA ?? '');
  const [nota, setNota] = useState('');

  // Si el caso cambia (por esta u otra persona), se reflejan los valores nuevos
  // sin borrar lo que se está editando en el otro campo.
  useEffect(() => setEstado(r.estado), [r.estado]);
  useEffect(() => setAsignado(r.asignadoA ?? ''), [r.asignadoA]);

  const faltaDato = estado === 'declinado' && !motivo;
  const cambioFecha = estado === 'con_ajustador' && fecha !== fechaInicial;

  return (
    <div className="gestion">
      <p className="operador">
        Trabajando como <strong>{operador || 'sin nombre'}</strong> ·{' '}
        <button className="enlace" onClick={onCambiarOperador}>
          cambiar
        </button>
      </p>

      <section className="bloque">
        <h3>Fase del reclamo</h3>
        <div className="fila-form">
          <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Fase">
            {ESTADOS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.titulo}
              </option>
            ))}
          </select>
          {estado === 'declinado' && (
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo de la declinación">
              <option value="">Motivo de la declinación…</option>
              {MOTIVOS_DECLINACION.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titulo}
                </option>
              ))}
            </select>
          )}
          {estado === 'con_ajustador' && (
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha de inspección" title="Fecha de inspección (opcional)" />
          )}
          <button
            className="boton compacto"
            disabled={enviando || (estado === r.estado && !cambioFecha) || faltaDato}
            onClick={() =>
              accion(
                { tipo: 'estado', estado, estadoAnterior: r.estado, motivoCierre: motivo, fechaInspeccion: fecha },
                estado === r.estado ? 'Fecha de inspección actualizada.' : `Fase actualizada a "${tituloDe(ESTADOS, estado)}".`,
              )
            }
          >
            Guardar
          </button>
        </div>
        {estado === 'con_ajustador' && <p className="sec">Fecha de inspección opcional.</p>}
        <p className="sec">En esta fase desde hace {diasDesde(r.faseDesde)} días.</p>
        {r.estado === 'declinado' && r.motivoCierre && <p className="sec">Declinado: {tituloDe(TODOS_LOS_MOTIVOS, r.motivoCierre)}</p>}
        {r.fechaInspeccion && <p className="sec">Inspección: {fmtDia.format(new Date(r.fechaInspeccion))}</p>}
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

function Analisis({ r, enviando, accion }: { r: ReporteBI; enviando: boolean; accion: Accion }) {
  const [causa, setCausa] = useState(r.causa ?? '');
  const [filas, setFilas] = useState<Record<string, { reclamado: string; reserva: string; pagado: string }>>(() =>
    Object.fromEntries(r.coberturas.map((c) => [c.id, { reclamado: String(c.reclamado || ''), reserva: String(c.reserva || ''), pagado: String(c.pagado || '') }])),
  );
  const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/,/g, '')));
  const seleccion = COBERTURAS.filter((c) => filas[c.id]);
  const invalido = seleccion.some((c) => Object.values(filas[c.id]).some((v) => !Number.isFinite(num(v)) || num(v) < 0));
  const totales = ['reclamado', 'reserva', 'pagado'].map((k) =>
    seleccion.reduce((suma, c) => suma + (num(filas[c.id][k as 'reclamado']) || 0), 0),
  );

  function alternar(id: string) {
    setFilas((f) => {
      const copia = { ...f };
      if (copia[id]) delete copia[id];
      else copia[id] = { reclamado: '', reserva: '', pagado: '' };
      return copia;
    });
  }

  function cambiar(id: string, campo: 'reclamado' | 'reserva' | 'pagado', valor: string) {
    setFilas((f) => ({ ...f, [id]: { ...f[id], [campo]: valor } }));
  }

  return (
    <div className="gestion">
      <section className="bloque">
        <h3>Causa del daño</h3>
        <select value={causa} onChange={(e) => setCausa(e.target.value)} aria-label="Causa">
          <option value="">Sin definir</option>
          {CAUSAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.titulo}
            </option>
          ))}
        </select>
      </section>

      <section className="bloque">
        <h3>Coberturas afectadas</h3>
        <p className="sec">Marque las coberturas y registre los montos en dólares. Reserva = monto estimado a pagar.</p>
        <div className="coberturas">
          {COBERTURAS.map((c) => {
            const fila = filas[c.id];
            return (
              <div key={c.id} className={'cobertura' + (fila ? ' activa' : '')}>
                <label className="cobertura-nombre">
                  <input type="checkbox" checked={!!fila} onChange={() => alternar(c.id)} />
                  {c.titulo}
                </label>
                {fila && (
                  <div className="montos">
                    {(['reclamado', 'reserva', 'pagado'] as const).map((campo) => (
                      <label key={campo}>
                        <span>{campo === 'reclamado' ? 'Reclamado' : campo === 'reserva' ? 'Reserva' : 'Pagado'}</span>
                        <input
                          inputMode="decimal"
                          value={fila[campo]}
                          placeholder="0.00"
                          onChange={(e) => cambiar(c.id, campo, e.target.value)}
                          aria-invalid={!Number.isFinite(num(fila[campo])) || num(fila[campo]) < 0}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {seleccion.length > 0 && (
          <dl className="totales">
            <div>
              <dt>Reclamado</dt>
              <dd>{fmtMonto.format(totales[0])}</dd>
            </div>
            <div>
              <dt>Reserva</dt>
              <dd>{fmtMonto.format(totales[1])}</dd>
            </div>
            <div>
              <dt>Pagado</dt>
              <dd>{fmtMonto.format(totales[2])}</dd>
            </div>
          </dl>
        )}
        <button
          className="boton compacto"
          disabled={enviando || invalido}
          onClick={() => {
            const coberturas: CoberturaAfectada[] = seleccion.map((c) => ({
              id: c.id,
              reclamado: num(filas[c.id].reclamado),
              reserva: num(filas[c.id].reserva),
              pagado: num(filas[c.id].pagado),
            }));
            accion({ tipo: 'analisis', causa, coberturas, version: r.analisisVersion }, 'Análisis guardado.');
          }}
        >
          Guardar análisis
        </button>
        {invalido && <p className="error">Revise los montos: deben ser números positivos.</p>}
      </section>
    </div>
  );
}

function Documentos({
  r,
  eventos,
  enviando,
  accion,
  onError,
}: {
  r: ReporteBI;
  eventos: Evento[] | null;
  enviando: boolean;
  accion: Accion;
  onError: (texto: string) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [progreso, setProgreso] = useState<number | null>(null);
  const documentos = (eventos ?? []).filter((e) => e.tipo === 'documento').reverse();

  async function subir() {
    if (!archivo || !tipoDocumento) return;
    if (archivo.size > MAX_BYTES_DOCUMENTO) return onError('El archivo supera los 25 MB.');
    const nombre = archivo.name.normalize('NFD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-120) || 'documento';
    setProgreso(0);
    try {
      const blob = await upload(`documentos/${r.id}/${nombre}`, archivo, {
        access: 'private',
        handleUploadUrl: '/api/documentos',
        multipart: archivo.size > 5 * 1024 * 1024,
        onUploadProgress: (p) => setProgreso(p.percentage),
      });
      const ok = await accion({ tipo: 'documento', pathname: blob.pathname, nombre: archivo.name, tipoDocumento, descripcion }, 'Documento agregado.');
      if (ok) {
        setArchivo(null);
        setDescripcion('');
        setTipoDocumento('');
      }
    } catch (e) {
      onError(e instanceof Error && e.message ? `No se pudo subir el archivo: ${e.message}` : 'No se pudo subir el archivo.');
    } finally {
      setProgreso(null);
    }
  }

  return (
    <div className="gestion">
      <section className="bloque">
        <h3>Agregar documento</h3>
        <p className="sec">PDF, Word, Excel, imágenes o correos (.eml/.msg), hasta 25 MB. Quedan privados y solo se ven desde el panel.</p>
        <input
          type="file"
          accept={[...TIPOS_ARCHIVO_DOCUMENTO, '.eml', '.msg', '.pdf', '.doc', '.docx', '.xls', '.xlsx'].join(',')}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          aria-label="Archivo"
        />
        <div className="fila-form">
          <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} aria-label="Tipo de documento">
            <option value="">Tipo de documento…</option>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.titulo}
              </option>
            ))}
          </select>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" maxLength={300} aria-label="Descripción" />
          <button className="boton compacto" disabled={enviando || progreso !== null || !archivo || !tipoDocumento} onClick={subir}>
            {progreso !== null ? `Subiendo… ${Math.round(progreso)} %` : 'Subir'}
          </button>
        </div>
      </section>

      <section className="bloque">
        <h3>Documentos del reclamo</h3>
        {!eventos ? (
          <p className="sec">Cargando…</p>
        ) : !documentos.length ? (
          <p className="sec">Todavía no hay documentos. Las fotos que envió el asegurado están en la pestaña Reporte.</p>
        ) : (
          <ul className="lista-documentos">
            {documentos.map((e) => (
              <li key={e.id}>
                <a href={`/api/panel?documento=${encodeURIComponent(e.datos.pathname)}&nombre=${encodeURIComponent(e.datos.nombre)}`} target="_blank" rel="noreferrer">
                  {e.datos.nombre}
                </a>
                <span className="sec">
                  {tituloDe(TIPOS_DOCUMENTO, e.datos.tipoDocumento)} · {fmtTamano(Number(e.datos.tamano))} · {fmtFechaHora.format(new Date(e.creado_en))} · {e.autor}
                </span>
                {e.datos.descripcion && <span className="sec">{e.datos.descripcion}</span>}
              </li>
            ))}
          </ul>
        )}
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
  const hayReportante = r.reportadoPor !== 'asegurado' && !!r.reportanteNombre;
  const [destinatario, setDestinatario] = useState<'asegurado' | 'reportante'>(hayReportante && !r.correo && !r.telefono ? 'reportante' : 'asegurado');
  const contacto =
    destinatario === 'reportante'
      ? { nombre: r.reportanteNombre ?? '', correo: r.reportanteCorreo ?? '', telefono: r.reportanteTelefono ?? '' }
      : { nombre: r.nombre, correo: r.correo, telefono: r.telefono };

  const valores = useMemo(
    () => ({
      nombre: contacto.nombre.split(/\s+/)[0],
      numero: r.numero,
      operador: operador || 'el equipo de reclamos',
      ubicacion: `${r.distrito}, ${r.provincia}`,
      fecha_inspeccion: r.fechaInspeccion ? fmtDia.format(new Date(r.fechaInspeccion)) : '[fecha]',
    }),
    [r, operador, contacto.nombre],
  );
  const asunto = llenarPlantilla(PLANTILLAS.find((p) => p.id === plantilla)?.asunto ?? `ASSA · Su reporte {numero}`, valores);
  const tel = soloDigitos(contacto.telefono);
  const comunicaciones = (eventos ?? []).filter((e) => e.tipo === 'comunicacion').reverse();

  return (
    <div className="gestion">
      <section className="bloque">
        <h3>Contacto</h3>
        {hayReportante && (
          <div className="segmentos destinatario" role="radiogroup" aria-label="Destinatario">
            <label className={destinatario === 'asegurado' ? 'activo' : ''}>
              <input type="radio" checked={destinatario === 'asegurado'} onChange={() => setDestinatario('asegurado')} />
              Asegurado
            </label>
            <label className={destinatario === 'reportante' ? 'activo' : ''}>
              <input type="radio" checked={destinatario === 'reportante'} onChange={() => setDestinatario('reportante')} />
              {tituloDe(REPORTANTES, r.reportadoPor)}: {r.reportanteNombre}
            </label>
          </div>
        )}
        <p className="contacto">
          {contacto.nombre} ·{' '}
          {contacto.telefono ? <a href={`tel:+507${tel}`}>+507 {contacto.telefono}</a> : <span className="sec">sin teléfono</span>} ·{' '}
          {contacto.correo ? <a href={`mailto:${contacto.correo}`}>{contacto.correo}</a> : <span className="sec">sin correo</span>}
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
            className={'boton compacto secundario' + (tel ? '' : ' deshabilitado')}
            href={tel ? `https://wa.me/507${tel}?text=${encodeURIComponent(mensaje)}` : undefined}
            target="_blank"
            rel="noreferrer"
            onClick={() => setCanal('whatsapp')}
          >
            Abrir WhatsApp
          </a>
          <a
            className={'boton compacto secundario' + (contacto.correo ? '' : ' deshabilitado')}
            href={contacto.correo ? `mailto:${contacto.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}` : undefined}
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
              const ok = await accion(
                { tipo: 'comunicacion', canal, resultado, texto: mensaje, plantilla, destinatario: destinatario === 'reportante' ? contacto.nombre : '' },
                'Contacto registrado.',
              );
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
        {dato('Reportado por', r.reportadoPor === 'asegurado' ? 'El asegurado' : `${tituloDe(REPORTANTES, r.reportadoPor)}: ${r.reportanteNombre ?? ''}`)}
        {r.reportadoPor !== 'asegurado' &&
          dato(
            'Contacto de quien reporta',
            [r.reportanteCodigo && `Código ${r.reportanteCodigo}`, r.reportanteCorreo, r.reportanteTelefono].filter(Boolean).join(' · '),
          )}
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
        Cambió la fase a <strong>{tituloEstado(d.a)}</strong>
        {d.motivoCierre && <> · {tituloDe(TODOS_LOS_MOTIVOS, d.motivoCierre)}</>}
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
        {d.destinatario && <> · con {d.destinatario}</>}
        {d.plantilla && <> · plantilla “{tituloDe(PLANTILLAS, d.plantilla)}”</>}
        {d.texto && <span className="lt-mensaje">{d.texto}</span>}
      </>
    );
  } else if (e.tipo === 'analisis') {
    const coberturas = (e.datos.coberturas as unknown as CoberturaAfectada[]) ?? [];
    const reserva = coberturas.reduce((s, c) => s + c.reserva, 0);
    const pagado = coberturas.reduce((s, c) => s + c.pagado, 0);
    texto = (
      <>
        Actualizó el análisis: causa <strong>{d.causa ? tituloDe(CAUSAS, d.causa) : 'sin definir'}</strong>
        {coberturas.length > 0 && (
          <>
            {' '}
            · {coberturas.map((c) => tituloDe(COBERTURAS, c.id)).join(', ')} · reserva {fmtMonto.format(reserva)} · pagado {fmtMonto.format(pagado)}
          </>
        )}
      </>
    );
  } else if (e.tipo === 'documento') {
    texto = (
      <>
        Subió <strong>{tituloDe(TIPOS_DOCUMENTO, d.tipoDocumento).toLowerCase()}</strong>:{' '}
        <a href={`/api/panel?documento=${encodeURIComponent(d.pathname)}&nombre=${encodeURIComponent(d.nombre)}`} target="_blank" rel="noreferrer">
          {d.nombre}
        </a>
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
