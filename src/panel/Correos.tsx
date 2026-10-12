// Bandeja de correos que llegaron sin número de reclamo en el asunto. Se
// asocian a un caso (sus adjuntos pasan a Documentos) o se descartan; nunca se
// borran. Sugiere casos por el correo del remitente o la póliza mencionada.
import { useCallback, useEffect, useState } from 'react';
import type { ReporteBI } from '../../api/panel';
import { fmtFechaHora } from './comun';

type Adjunto = { pathname: string; nombre: string; tamano: number };
type ReporteCorreo = {
  id: number;
  numero: string;
  estado: 'pendiente' | 'creado' | 'descartado';
  remitente: string;
  remitenteNombre: string | null;
  datos: { nombre?: string; poliza?: string; distrito?: string; provincia?: string; descripcion?: string };
  faltantes: string[];
  mensajes: number;
  respuestas: number;
  reclamo: string | null;
  gestionadoPor: string | null;
  creadoEn: string;
  actualizadoEn: string;
};
type Correo = {
  mensajeId: string;
  recibidoEn: string;
  de: string;
  deNombre: string;
  asunto: string;
  texto: string;
  adjuntos: Adjunto[];
  omitidos?: string[];
  estado: 'pendiente' | 'asociado' | 'descartado';
  numero: string | null;
  gestionadoPor: string | null;
  gestionadoEn: string | null;
};

const normalizar = (s: string) => s.toUpperCase().replace(/[\s-]+/g, '');

// Casos que probablemente corresponden al correo.
function sugerencias(c: Correo, reportes: ReporteBI[]) {
  const de = c.de.toLowerCase();
  const contenido = normalizar(`${c.asunto} ${c.texto}`);
  return reportes
    .filter((r) => r.id && (r.correo.toLowerCase() === de || r.reportanteCorreo?.toLowerCase() === de || (normalizar(r.poliza).length >= 4 && contenido.includes(normalizar(r.poliza)))))
    .slice(0, 5);
}

export default function Correos({
  reportes,
  simulado,
  simulacion,
  onCambio,
}: {
  reportes: ReporteBI[];
  simulado: boolean;
  simulacion: boolean; // solo en el ambiente de pruebas
  onCambio: () => Promise<void>;
}) {
  const [correos, setCorreos] = useState<Correo[] | null>(null);
  const [reportesCorreo, setReportesCorreo] = useState<ReporteCorreo[]>([]);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [numeros, setNumeros] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const res = await fetch('/api/correo?bandeja=1', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json();
    setCorreos(json.correos);
    setReportesCorreo(json.reportes ?? []);
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  async function pedir(cuerpo: object, exito: (json: Record<string, unknown>) => string) {
    setOcupado(true);
    setAviso(null);
    const res = await fetch('/api/correo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setOcupado(false);
    setAviso(res?.ok ? { ok: true, texto: exito(json) } : { ok: false, texto: json.error ?? 'No se pudo completar la acción.' });
    await Promise.all([cargar(), onCambio()]);
  }

  const pendientes = (correos ?? []).filter((c) => c.estado === 'pendiente');
  const gestionados = (correos ?? []).filter((c) => c.estado !== 'pendiente');
  const incompletos = reportesCorreo.filter((b) => b.estado === 'pendiente');
  const resueltos = reportesCorreo.filter((b) => b.estado !== 'pendiente');
  const resultado = (json: Record<string, unknown>) =>
    json.estado === 'creado'
      ? `Se creó el reclamo ${json.numero} y se respondió al remitente con el número.`
      : json.estado === 'incompleto'
        ? `Reporte ${json.borrador} incompleto: se le pidió al remitente lo que falta.`
        : 'El correo quedó en la bandeja para revisarlo.';

  return (
    <>
      <div className="panel-titulo">
        <div>
          <h1>Correos</h1>
          <p>
            Los reportes de daños que llegan por correo se registran solos: si traen todos los datos se crea el reclamo y se responde con el
            número; si falta algo, se le pide al remitente. Aquí están los que esperan respuesta y los correos que una persona debe asociar a un
            caso o descartar. Nada se borra.
          </p>
        </div>
      </div>

      {aviso && <p className={aviso.ok ? 'aviso-ok' : 'error resumen'}>{aviso.texto}</p>}

      {simulado && (
        <section className="tarjeta grafico ancho">
          <p className="aviso-gestion">
            Correo en modo simulado: todavía no hay conexión con el buzón de Microsoft 365.{' '}
            {simulacion ? 'Puede probar el flujo con correos de ejemplo.' : 'Para probar el flujo con correos de ejemplo, use el ambiente de pruebas.'}
          </p>
          {simulacion && (
            <div className="acciones-mensaje">
              <button className="boton compacto secundario" disabled={ocupado} onClick={() => pedir({ accion: 'simular', tipo: 'completo' }, resultado)}>
                Simular reporte completo
              </button>
              <button className="boton compacto secundario" disabled={ocupado} onClick={() => pedir({ accion: 'simular', tipo: 'incompleto' }, resultado)}>
                Simular reporte incompleto
              </button>
              <button className="boton compacto secundario" disabled={ocupado} onClick={() => pedir({ accion: 'simular' }, resultado)}>
                Simular consulta sin número
              </button>
            </div>
          )}
        </section>
      )}

      <section className="tarjeta grafico ancho">
        <h2>Reportes por correo incompletos ({incompletos.length})</h2>
        {!correos ? (
          <p className="sec">Cargando…</p>
        ) : !incompletos.length ? (
          <p className="sec">Ninguno espera datos del remitente.</p>
        ) : (
          <ul className="lista-correos">
            {incompletos.map((b) => (
              <li key={b.id} className="correo-pendiente">
                <div className="correo-cabecera">
                  <strong>{b.numero}</strong>
                  <span>{b.remitenteNombre || b.remitente}</span>
                  {b.remitenteNombre && <span className="sec">{b.remitente}</span>}
                  <span className="sec mono">{fmtFechaHora.format(new Date(b.actualizadoEn))}</span>
                </div>
                <p className="sec">
                  {[b.datos.nombre, b.datos.poliza && `póliza ${b.datos.poliza}`, b.datos.distrito && `${b.datos.distrito}, ${b.datos.provincia}`]
                    .filter(Boolean)
                    .join(' · ') || 'Sin datos todavía'}{' '}
                  · {b.mensajes} {b.mensajes === 1 ? 'correo' : 'correos'} · {b.respuestas} de 3 respuestas automáticas
                </p>
                <div>
                  <span className="sec">Falta:</span>
                  <ul className="faltantes">
                    {b.faltantes.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                {b.respuestas >= 3 && (
                  <p className="aviso-gestion">Ya se enviaron 3 respuestas automáticas: contacte al remitente directamente o descarte el reporte.</p>
                )}
                <div className="acciones-mensaje">
                  {simulacion && (
                    <button className="boton compacto secundario" disabled={ocupado} onClick={() => pedir({ accion: 'simular_respuesta', id: b.id }, resultado)}>
                      Simular respuesta del remitente
                    </button>
                  )}
                  <button
                    className="boton compacto secundario"
                    disabled={ocupado}
                    onClick={() => pedir({ accion: 'descartar_reporte', id: b.id }, () => `Reporte ${b.numero} descartado. Sigue guardado en el registro.`)}
                  >
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta grafico ancho">
        <h2>Correos por asociar ({pendientes.length})</h2>
        {!correos ? (
          <p className="sec">Cargando…</p>
        ) : !pendientes.length ? (
          <p className="sec">No hay correos pendientes. Los que traen el número TRM en el asunto se asocian solos a su caso.</p>
        ) : (
          <ul className="lista-correos">
            {pendientes.map((c) => {
              const numero = numeros[c.mensajeId] ?? '';
              const sugeridos = sugerencias(c, reportes);
              return (
                <li key={c.mensajeId} className="correo-pendiente">
                  <div className="correo-cabecera">
                    <strong>{c.deNombre || c.de}</strong>
                    {c.deNombre && <span className="sec">{c.de}</span>}
                    <span className="sec mono">{fmtFechaHora.format(new Date(c.recibidoEn))}</span>
                  </div>
                  <span className="lt-asunto">{c.asunto || '(sin asunto)'}</span>
                  {c.texto && <span className="lt-mensaje">{c.texto}</span>}
                  {c.adjuntos.length > 0 && (
                    <p className="sec">
                      Adjuntos:{' '}
                      {c.adjuntos.map((a, i) => (
                        <span key={a.pathname}>
                          {i > 0 && ', '}
                          <a href={`/api/correo?adjunto=${encodeURIComponent(a.pathname)}&nombre=${encodeURIComponent(a.nombre)}`} target="_blank" rel="noreferrer">
                            {a.nombre}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                  {c.omitidos?.length ? <p className="sec">Adjuntos de más de 25 MB (quedan en el buzón): {c.omitidos.join(', ')}</p> : null}
                  {sugeridos.length > 0 && (
                    <div className="sugerencias">
                      <span className="sec">Posibles casos:</span>
                      {sugeridos.map((r) => (
                        <button key={r.numero} className="chip-sugerencia" onClick={() => setNumeros({ ...numeros, [c.mensajeId]: r.numero })}>
                          {r.numero} · {r.nombre} · póliza {r.poliza}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="fila-form">
                    <input
                      value={numero}
                      onChange={(e) => setNumeros({ ...numeros, [c.mensajeId]: e.target.value })}
                      placeholder="Número de reclamo, p. ej. TRM-000123"
                      aria-label={`Número de reclamo para el correo de ${c.de}`}
                    />
                    <button
                      className="boton compacto"
                      disabled={ocupado || !numero.trim()}
                      onClick={() => pedir({ accion: 'asociar', mensajeId: c.mensajeId, numero }, (json) => `Correo asociado a ${json.numero}.`)}
                    >
                      Asociar
                    </button>
                    <button
                      className="boton compacto secundario"
                      disabled={ocupado}
                      title="Leer el correo de nuevo y crear el reclamo si trae los datos (o pedir lo que falta)"
                      onClick={() => pedir({ accion: 'reintentar', mensajeId: c.mensajeId }, resultado)}
                    >
                      Crear reclamo
                    </button>
                    <button
                      className="boton compacto secundario"
                      disabled={ocupado}
                      onClick={() => pedir({ accion: 'descartar', mensajeId: c.mensajeId }, () => 'Correo descartado. Sigue guardado en el registro.')}
                    >
                      Descartar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(gestionados.length > 0 || resueltos.length > 0) && (
        <section className="tarjeta grafico ancho">
          <h2>Gestionados recientemente</h2>
          <ul className="linea-tiempo">
            {resueltos.map((b) => (
              <li key={b.numero}>
                <span className="lt-fecha">
                  {fmtFechaHora.format(new Date(b.actualizadoEn))} · {b.gestionadoPor ?? 'Ingreso automático'}
                </span>
                <span className="lt-texto">
                  {b.estado === 'creado' ? (
                    <>
                      Reporte por correo {b.numero} → reclamo <strong>{b.reclamo}</strong>
                    </>
                  ) : (
                    <>
                      <strong>Descartado</strong> el reporte por correo {b.numero}
                    </>
                  )}{' '}
                  · {b.remitenteNombre || b.remitente}
                </span>
              </li>
            ))}
            {gestionados.map((c) => (
              <li key={c.mensajeId}>
                <span className="lt-fecha">
                  {c.gestionadoEn && fmtFechaHora.format(new Date(c.gestionadoEn))} · {c.gestionadoPor}
                </span>
                <span className="lt-texto">
                  {c.estado === 'asociado' ? (
                    <>
                      Asociado a <strong>{c.numero}</strong>
                    </>
                  ) : (
                    <strong>Descartado</strong>
                  )}{' '}
                  · {c.deNombre || c.de} · {c.asunto || '(sin asunto)'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
