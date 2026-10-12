// Bandeja de correos que llegaron sin número de reclamo en el asunto. Se
// asocian a un caso (sus adjuntos pasan a Documentos) o se descartan; nunca se
// borran. Sugiere casos por el correo del remitente o la póliza mencionada.
import { useCallback, useEffect, useState } from 'react';
import type { ReporteBI } from '../../api/panel';
import { fmtFechaHora } from './comun';

type Adjunto = { pathname: string; nombre: string; tamano: number };
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
  onCambio,
}: {
  reportes: ReporteBI[];
  simulado: boolean;
  onCambio: () => Promise<void>;
}) {
  const [correos, setCorreos] = useState<Correo[] | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [numeros, setNumeros] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const res = await fetch('/api/correo?bandeja=1', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setCorreos((await res.json()).correos);
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

  return (
    <>
      <div className="panel-titulo">
        <div>
          <h1>Correos sin caso</h1>
          <p>
            Correos que llegaron al buzón sin número de reclamo en el asunto. Asócielos al caso que corresponde (los adjuntos pasan a Documentos) o
            descártelos si no tienen relación. Nada se borra.
          </p>
        </div>
      </div>

      {aviso && <p className={aviso.ok ? 'aviso-ok' : 'error resumen'}>{aviso.texto}</p>}

      {simulado && (
        <section className="tarjeta grafico ancho">
          <p className="aviso-gestion">
            Correo en modo simulado: todavía no hay conexión con el buzón de Microsoft 365. Puede probar la bandeja con un correo de ejemplo.
          </p>
          <button
            className="boton compacto secundario"
            disabled={ocupado}
            onClick={() => pedir({ accion: 'simular' }, () => 'Llegó un correo simulado sin número de reclamo.')}
          >
            Simular correo sin número
          </button>
        </section>
      )}

      <section className="tarjeta grafico ancho">
        <h2>Por asociar ({pendientes.length})</h2>
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

      {gestionados.length > 0 && (
        <section className="tarjeta grafico ancho">
          <h2>Gestionados recientemente</h2>
          <ul className="linea-tiempo">
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
