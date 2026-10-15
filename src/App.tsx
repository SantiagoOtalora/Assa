import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  EXTENSION,
  GRUPOS_DANO,
  HABITABILIDAD,
  LARGO_MAX_DESCRIPCION,
  LARGO_MIN_DESCRIPCION,
  MAX_FOTOS,
  OPERACION,
  PROVINCIAS,
  RE_CORREO,
  RE_TELEFONO,
  RIESGOS,
  TIPOS_PROPIEDAD,
  normalizarTelefono,
} from '../shared/catalogos.js';
import { REPORTANTES } from '../shared/flujo.js';
import { comprimirFoto } from './fotos';
import { Campo, Grupo, Marco, Seccion } from './marco';

type Form = {
  ref: string;
  reportadoPor: string;
  reportanteNombre: string;
  reportanteCodigo: string;
  reportanteCorreo: string;
  reportanteTelefono: string;
  nombre: string;
  poliza: string;
  unidad: string;
  correo: string;
  telefono: string;
  provincia: string;
  distrito: string;
  direccion: string;
  tipoPropiedad: string;
  tiposDano: string[];
  habitabilidad: string;
  riesgos: string[];
  sinRiesgos: boolean;
  extension: string;
  operacion: string;
  fechaDano: string;
  descripcion: string;
  consentimiento: boolean;
  sitioWeb: string;
};

type Foto = { archivo: File; url: string };

const VACIO: Omit<Form, 'ref'> = {
  reportadoPor: 'asegurado',
  reportanteNombre: '',
  reportanteCodigo: '',
  reportanteCorreo: '',
  reportanteTelefono: '',
  nombre: '',
  poliza: '',
  unidad: '',
  correo: '',
  telefono: '',
  provincia: '',
  distrito: '',
  direccion: '',
  tipoPropiedad: '',
  tiposDano: [],
  habitabilidad: '',
  riesgos: [],
  sinRiesgos: false,
  extension: '',
  operacion: '',
  fechaDano: '',
  descripcion: '',
  consentimiento: false,
  sitioWeb: '',
};

const EJEMPLO_DESCRIPCION =
  'Ejemplo: Durante el sismo se abrieron grietas en diagonal en la pared de la sala, junto a la ventana. ' +
  'Se cayó parte del cielo raso de la cocina y la puerta del cuarto principal ya no cierra bien. ' +
  'También se rompió el televisor. No hubo personas heridas.';

// El avance se guarda en este dispositivo para no perderlo si se cierra la
// pestaña o falla el envío (las fotos no se guardan).
const CLAVE_BORRADOR = 'assa-sismo-borrador';

function nuevoForm(): Form {
  return { ...VACIO, ref: crypto.randomUUID() };
}

function leerBorrador(): Form | null {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? 'null');
    if (!guardado?.ref) return null;
    const f: Form = { ...nuevoForm(), ...guardado, sitioWeb: '' };
    const vacio = Object.entries(VACIO).every(([k, v]) => JSON.stringify(f[k as keyof Form]) === JSON.stringify(v));
    return vacio ? null : f;
  } catch {
    return null;
  }
}

function guardarBorrador(f: Form | null) {
  try {
    if (f) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(f));
    else localStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // Sin almacenamiento disponible (modo privado): el formulario sigue funcionando.
  }
}

function hoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function validar(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  const tercero = f.reportadoPor !== 'asegurado';
  if (tercero) {
    if (!f.reportanteNombre.trim())
      e.reportanteNombre = f.reportadoPor === 'corredor' ? 'Ingrese el nombre del corredor o corredora.' : 'Ingrese su nombre.';
    if (!RE_CORREO.test(f.reportanteCorreo.trim())) e.reportanteCorreo = 'Ingrese un correo válido.';
    if (f.reportanteTelefono.trim() && !RE_TELEFONO.test(normalizarTelefono(f.reportanteTelefono)))
      e.reportanteTelefono = 'Ingrese un teléfono de 7 u 8 dígitos.';
  }
  if (!f.nombre.trim()) e.nombre = tercero ? 'Ingrese el nombre del asegurado.' : 'Ingrese su nombre completo.';
  if (!f.poliza.trim()) e.poliza = 'Ingrese el número de póliza.';
  // Si reporta un corredor o ejecutivo, el contacto del asegurado es opcional.
  if ((!tercero || f.correo.trim()) && !RE_CORREO.test(f.correo.trim())) e.correo = 'Ingrese un correo válido.';
  if ((!tercero || f.telefono.trim()) && !RE_TELEFONO.test(normalizarTelefono(f.telefono)))
    e.telefono = 'Ingrese un teléfono de 7 u 8 dígitos.';
  if (!f.provincia) e.provincia = 'Seleccione la provincia.';
  if (!f.distrito) e.distrito = 'Seleccione el distrito.';
  if (!f.direccion.trim()) e.direccion = 'Indique la dirección o un punto de referencia.';
  if (!f.tipoPropiedad) e.tipoPropiedad = 'Seleccione el tipo de inmueble.';
  if (!f.tiposDano.length) e.tiposDano = 'Seleccione al menos un tipo de daño.';
  if (!f.habitabilidad) e.habitabilidad = 'Indique el estado del inmueble.';
  if (!f.riesgos.length && !f.sinRiesgos) e.riesgos = 'Marque las situaciones presentes o "Ninguna".';
  if (!f.extension) e.extension = 'Indique qué tanto está afectado.';
  if (f.tipoPropiedad && f.tipoPropiedad !== 'Residencial' && !f.operacion)
    e.operacion = 'Indique el estado de la operación.';
  if (!f.fechaDano) e.fechaDano = 'Indique la fecha.';
  if (f.descripcion.trim().length < LARGO_MIN_DESCRIPCION)
    e.descripcion = `Cuéntenos un poco más (mínimo ${LARGO_MIN_DESCRIPCION} caracteres).`;
  if (!f.consentimiento) e.consentimiento = 'Debe aceptar para poder enviar el reclamo.';
  return e;
}

export default function App() {
  const [borrador] = useState(leerBorrador);
  const [form, setForm] = useState<Form>(() => borrador ?? nuevoForm());
  const [avisoBorrador, setAvisoBorrador] = useState(!!borrador);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [procesandoFotos, setProcesandoFotos] = useState(false);
  const [errorFotos, setErrorFotos] = useState('');
  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [numero, setNumero] = useState('');

  useEffect(() => {
    if (!numero) guardarBorrador(form);
  }, [form, numero]);

  const errores = useMemo(() => validar(form), [form]);
  const tercero = form.reportadoPor !== 'asegurado';
  const err = (campo: keyof Form) => (intentoEnvio ? errores[campo] : undefined);
  const distritos = form.provincia ? PROVINCIAS[form.provincia] : [];

  function set<K extends keyof Form>(campo: K, valor: Form[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function alternarDano(id: string) {
    setForm((f) => ({
      ...f,
      tiposDano: f.tiposDano.includes(id) ? f.tiposDano.filter((t) => t !== id) : [...f.tiposDano, id],
    }));
  }

  function alternarRiesgo(id: string) {
    setForm((f) => ({
      ...f,
      sinRiesgos: false,
      riesgos: f.riesgos.includes(id) ? f.riesgos.filter((t) => t !== id) : [...f.riesgos, id],
    }));
  }

  async function agregarFotos(lista: FileList | null) {
    if (!lista) return;
    setErrorFotos('');
    const disponibles = MAX_FOTOS - fotos.length;
    const elegidas = Array.from(lista).slice(0, disponibles);
    if (lista.length > disponibles) setErrorFotos(`Puede adjuntar máximo ${MAX_FOTOS} fotos.`);
    setProcesandoFotos(true);
    const nuevas: Foto[] = [];
    for (const archivo of elegidas) {
      try {
        const comprimida = await comprimirFoto(archivo);
        nuevas.push({ archivo: comprimida, url: URL.createObjectURL(comprimida) });
      } catch {
        setErrorFotos(`No pudimos procesar "${archivo.name}". Intente con otra foto (JPG o PNG).`);
      }
    }
    setFotos((f) => [...f, ...nuevas]);
    setProcesandoFotos(false);
  }

  function quitarFoto(i: number) {
    setFotos((f) => {
      URL.revokeObjectURL(f[i].url);
      return f.filter((_, j) => j !== i);
    });
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIntentoEnvio(true);
    setErrorEnvio('');
    if (Object.keys(errores).length) {
      requestAnimationFrame(() =>
        document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
      return;
    }
    setEnviando(true);
    try {
      const cuerpo = new FormData();
      cuerpo.append('datos', JSON.stringify(form));
      fotos.forEach((f) => cuerpo.append('fotos', f.archivo));
      const res = await fetch('/api/reclamos', { method: 'POST', body: cuerpo });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No pudimos registrar su reclamo.');
      guardarBorrador(null);
      setNumero(json.numero);
      window.scrollTo({ top: 0 });
    } catch (ex) {
      setErrorEnvio(ex instanceof Error ? ex.message : 'No pudimos registrar su reclamo.');
    } finally {
      setEnviando(false);
    }
  }

  if (numero) {
    return (
      <Marco>
        <section className="tarjeta exito">
          <div className="exito-icono" aria-hidden>✓</div>
          <h2>¡Gracias por su reporte!</h2>
          <p>Hemos recibido la información de su inmueble. Su número de reporte es</p>
          <p className="numero-reclamo">{numero}</p>
          <p>
            Guárdelo como referencia. Puede consultar en qué fase está en{' '}
            <a href={`/consulta?numero=${encodeURIComponent(numero)}`}>la página de consulta</a> con este número y el de la
            póliza.
          </p>
          {(form.habitabilidad === 'no' || form.riesgos.some((x) => x !== 'agua')) && (
            <p className="aviso">
              Si no es seguro permanecer en el inmueble, salga del lugar y siga las indicaciones de SINAPROC.
              En caso de emergencia llame al <strong>911</strong>.
            </p>
          )}
          <button
            type="button"
            className="boton secundario"
            onClick={() => {
              // Un corredor o ejecutivo suele reportar varios inmuebles: se conservan sus datos.
              setForm({
                ...nuevoForm(),
                reportadoPor: form.reportadoPor,
                reportanteNombre: form.reportanteNombre,
                reportanteCodigo: form.reportanteCodigo,
                reportanteCorreo: form.reportanteCorreo,
                reportanteTelefono: form.reportanteTelefono,
              });
              setAvisoBorrador(false);
              fotos.forEach((f) => URL.revokeObjectURL(f.url));
              setFotos([]);
              setIntentoEnvio(false);
              setNumero('');
            }}
          >
            Registrar otro inmueble
          </button>
        </section>
      </Marco>
    );
  }

  return (
    <Marco>
      <section className="intro">
        <h1>Reporte de daños por sismo</h1>
        <p>
          Lamentamos lo ocurrido. Con este reporte inicial organizamos la atención de su caso. Mientras más
          precisa sea la información, más rápido podremos avanzar. Le tomará unos 5 minutos.
        </p>
        <p className="alerta-911">
          <strong>¿Hay olor a gas, cables expuestos o riesgo de derrumbe?</strong> Salga del inmueble y llame al{' '}
          <a href="tel:911">911</a> antes de llenar este formulario.
        </p>
      </section>

      {avisoBorrador && (
        <p className="aviso-borrador">
          Recuperamos el reporte que dejó sin enviar en este dispositivo.
          <button
            type="button"
            onClick={() => {
              setForm(nuevoForm());
              setIntentoEnvio(false);
              setAvisoBorrador(false);
            }}
          >
            Empezar de nuevo
          </button>
        </p>
      )}

      <form className="tarjeta" onSubmit={enviar} noValidate>
        <Seccion n={1} titulo="¿Quién reporta?">
          <div className="segmentos" role="radiogroup" aria-label="Quién reporta">
            {REPORTANTES.map((x) => (
              <label key={x.id} className={form.reportadoPor === x.id ? 'activo' : ''}>
                <input type="radio" name="reportadoPor" checked={form.reportadoPor === x.id} onChange={() => set('reportadoPor', x.id)} />
                {x.id === 'asegurado' ? 'Soy el asegurado' : x.titulo}
              </label>
            ))}
          </div>
          {tercero && (
            <div className="datos-reportante">
              <div className="fila">
                <Campo
                  id="reportanteNombre"
                  etiqueta={form.reportadoPor === 'corredor' ? 'Corredor o corredora' : 'Su nombre'}
                  ayuda={form.reportadoPor === 'corredor' ? 'Nombre de la persona o de la empresa corredora' : undefined}
                  error={err('reportanteNombre')}
                >
                  <input id="reportanteNombre" value={form.reportanteNombre} onChange={(e) => set('reportanteNombre', e.target.value)} aria-invalid={!!err('reportanteNombre')} />
                </Campo>
                {form.reportadoPor === 'corredor' && (
                  <Campo id="reportanteCodigo" etiqueta="Código de corredor" opcional ayuda="Si lo tiene a mano">
                    <input id="reportanteCodigo" value={form.reportanteCodigo} onChange={(e) => set('reportanteCodigo', e.target.value)} />
                  </Campo>
                )}
              </div>
              <div className="fila">
                <Campo id="reportanteCorreo" etiqueta="Su correo" error={err('reportanteCorreo')}>
                  <input
                    id="reportanteCorreo"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.reportanteCorreo}
                    onChange={(e) => set('reportanteCorreo', e.target.value)}
                    aria-invalid={!!err('reportanteCorreo')}
                  />
                </Campo>
                <Campo id="reportanteTelefono" etiqueta="Su teléfono" opcional error={err('reportanteTelefono')}>
                  <div className="prefijo">
                    <span>+507</span>
                    <input
                      id="reportanteTelefono"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={form.reportanteTelefono}
                      onChange={(e) => set('reportanteTelefono', e.target.value)}
                      aria-invalid={!!err('reportanteTelefono')}
                    />
                  </div>
                </Campo>
              </div>
            </div>
          )}
        </Seccion>

        <Seccion n={2} titulo="Datos del asegurado">
          <Campo id="nombre" etiqueta={tercero ? 'Nombre completo del asegurado' : 'Nombre completo'} error={err('nombre')}>
            <input id="nombre" autoComplete="name" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} aria-invalid={!!err('nombre')} />
          </Campo>
          <div className="fila">
            <Campo id="poliza" etiqueta="Número de póliza" error={err('poliza')}>
              <input id="poliza" value={form.poliza} placeholder="Ej. 02-B-12345" onChange={(e) => set('poliza', e.target.value)} aria-invalid={!!err('poliza')} />
            </Campo>
            <Campo id="unidad" etiqueta="Número de unidad" opcional ayuda="Apartamento, local o bodega, si aplica">
              <input id="unidad" value={form.unidad} placeholder="Ej. 12-B" onChange={(e) => set('unidad', e.target.value)} />
            </Campo>
          </div>
          <div className="fila">
            <Campo id="correo" etiqueta={tercero ? 'Correo del asegurado' : 'Correo electrónico'} opcional={tercero} error={err('correo')}>
              <input id="correo" type="email" autoComplete="email" inputMode="email" value={form.correo} onChange={(e) => set('correo', e.target.value)} aria-invalid={!!err('correo')} />
            </Campo>
            <Campo id="telefono" etiqueta={tercero ? 'Teléfono del asegurado' : 'Teléfono'} opcional={tercero} error={err('telefono')}>
              <div className="prefijo">
                <span>+507</span>
                <input id="telefono" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="6000-0000" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} aria-invalid={!!err('telefono')} />
              </div>
            </Campo>
          </div>
        </Seccion>

        <Seccion n={3} titulo="Ubicación del inmueble">
          <div className="fila">
            <Campo id="provincia" etiqueta="Provincia o comarca" error={err('provincia')}>
              <select
                id="provincia"
                value={form.provincia}
                onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value, distrito: '' }))}
                aria-invalid={!!err('provincia')}
              >
                <option value="">Seleccione…</option>
                {Object.keys(PROVINCIAS).map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Campo>
            <Campo id="distrito" etiqueta="Distrito" error={err('distrito')}>
              <select id="distrito" value={form.distrito} disabled={!form.provincia} onChange={(e) => set('distrito', e.target.value)} aria-invalid={!!err('distrito')}>
                <option value="">{form.provincia ? 'Seleccione…' : 'Primero elija la provincia'}</option>
                {distritos.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo id="direccion" etiqueta="Dirección o punto de referencia" error={err('direccion')} ayuda="Corregimiento, barriada, calle, edificio o casa">
            <input id="direccion" autoComplete="street-address" value={form.direccion} placeholder="Ej. Bella Vista, Calle 50, PH Torre Azul" onChange={(e) => set('direccion', e.target.value)} aria-invalid={!!err('direccion')} />
          </Campo>
          <Grupo etiqueta="Tipo de inmueble" error={err('tipoPropiedad')}>
            <div className="segmentos" role="radiogroup">
              {TIPOS_PROPIEDAD.map((t) => (
                <label key={t} className={form.tipoPropiedad === t ? 'activo' : ''}>
                  <input type="radio" name="tipoPropiedad" value={t} checked={form.tipoPropiedad === t} onChange={() => set('tipoPropiedad', t)} aria-invalid={!!err('tipoPropiedad')} />
                  {t}
                </label>
              ))}
            </div>
          </Grupo>
        </Seccion>

        <Seccion n={4} titulo="Daños">
          <Grupo etiqueta="¿Qué tipo de daños observa?" ayuda="Puede marcar varios" error={err('tiposDano')}>
            {GRUPOS_DANO.map((g) => (
              <fieldset key={g.grupo} className="grupo-dano">
                <legend>{g.grupo}</legend>
                <div className="opciones-dano">
                  {g.tipos.map((t) => {
                    const activo = form.tiposDano.includes(t.id);
                    return (
                      <label key={t.id} className={'opcion-dano' + (activo ? ' activo' : '')}>
                        <input type="checkbox" checked={activo} onChange={() => alternarDano(t.id)} aria-invalid={!!err('tiposDano')} />
                        <span className="opcion-titulo">{t.titulo}</span>
                        <span className="opcion-detalle">{t.detalle}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </Grupo>

          <Campo id="fechaDano" etiqueta="Fecha en que ocurrió o notó el daño" error={err('fechaDano')} angosto>
            <input id="fechaDano" type="date" max={hoy()} value={form.fechaDano} onChange={(e) => set('fechaDano', e.target.value)} aria-invalid={!!err('fechaDano')} />
          </Campo>

          <Campo id="descripcion" etiqueta="Cuéntenos qué pasó" error={err('descripcion')}>
            <textarea
              id="descripcion"
              rows={6}
              maxLength={LARGO_MAX_DESCRIPCION}
              placeholder={EJEMPLO_DESCRIPCION}
              value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              aria-invalid={!!err('descripcion')}
            />
            <span className="contador">
              {form.descripcion.length}/{LARGO_MAX_DESCRIPCION}
            </span>
          </Campo>
        </Seccion>

        <Seccion n={5} titulo="Situación actual">
          <Grupo
            etiqueta="¿Se puede habitar o usar el inmueble?"
            ayuda="Las grietas finas en pintura o repello por sí solas no impiden usar el inmueble."
            error={err('habitabilidad')}
          >
            <div className="lista-radio" role="radiogroup">
              {HABITABILIDAD.map((h) => (
                <label key={h.id} className={form.habitabilidad === h.id ? 'activo' : ''}>
                  <input type="radio" name="habitabilidad" checked={form.habitabilidad === h.id} onChange={() => set('habitabilidad', h.id)} aria-invalid={!!err('habitabilidad')} />
                  {h.titulo}
                </label>
              ))}
            </div>
          </Grupo>

          <Grupo etiqueta="¿Hay alguna de estas situaciones en este momento?" ayuda="Puede marcar varias" error={err('riesgos')}>
            <div className="lista-radio">
              {RIESGOS.map((r) => (
                <label key={r.id} className={form.riesgos.includes(r.id) ? 'activo riesgo' : ''}>
                  <input type="checkbox" checked={form.riesgos.includes(r.id)} onChange={() => alternarRiesgo(r.id)} aria-invalid={!!err('riesgos')} />
                  {r.titulo}
                </label>
              ))}
              <label className={form.sinRiesgos ? 'activo' : ''}>
                <input
                  type="checkbox"
                  checked={form.sinRiesgos}
                  onChange={(e) => setForm((f) => ({ ...f, sinRiesgos: e.target.checked, riesgos: [] }))}
                  aria-invalid={!!err('riesgos')}
                />
                Ninguna de estas
              </label>
            </div>
            {form.riesgos.some((r) => r !== 'agua') && (
              <p className="aviso">
                Por su seguridad, aléjese del área afectada. Si hay fuga de gas o riesgo eléctrico, cierre la llave de
                gas o el interruptor principal solo si puede hacerlo sin peligro, y llame al <strong>911</strong>.
              </p>
            )}
          </Grupo>

          <Grupo etiqueta="¿Qué tanto del inmueble está afectado?" error={err('extension')}>
            <div className="segmentos" role="radiogroup">
              {EXTENSION.map((x) => (
                <label key={x.id} className={form.extension === x.id ? 'activo' : ''}>
                  <input type="radio" name="extension" checked={form.extension === x.id} onChange={() => set('extension', x.id)} aria-invalid={!!err('extension')} />
                  {x.titulo}
                </label>
              ))}
            </div>
          </Grupo>

          {form.tipoPropiedad && form.tipoPropiedad !== 'Residencial' && (
            <Grupo etiqueta="¿El negocio u operación está detenido por los daños?" error={err('operacion')}>
              <div className="lista-radio" role="radiogroup">
                {OPERACION.map((x) => (
                  <label key={x.id} className={form.operacion === x.id ? 'activo' : ''}>
                    <input type="radio" name="operacion" checked={form.operacion === x.id} onChange={() => set('operacion', x.id)} aria-invalid={!!err('operacion')} />
                    {x.titulo}
                  </label>
                ))}
              </div>
            </Grupo>
          )}
        </Seccion>

        <Seccion n={6} titulo="Fotos de los daños" opcional>
          <p className="ayuda">
            Hasta {MAX_FOTOS} fotos. Incluya una vista general y acercamientos de cada daño. Las fotos ayudan a agilizar su reclamo.
          </p>
          <div className="fotos">
            {fotos.map((f, i) => (
              <figure key={f.url} className="foto">
                <img src={f.url} alt={`Foto ${i + 1}`} />
                <button type="button" onClick={() => quitarFoto(i)} aria-label={`Quitar foto ${i + 1}`}>
                  ×
                </button>
              </figure>
            ))}
            {fotos.length < MAX_FOTOS && (
              <label className="agregar-foto">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={procesandoFotos}
                  onChange={(e) => {
                    agregarFotos(e.target.files);
                    e.target.value = '';
                  }}
                />
                <span className="mas" aria-hidden>
                  {procesandoFotos ? '…' : '+'}
                </span>
                <span>{procesandoFotos ? 'Procesando' : 'Agregar foto'}</span>
                <span className="cuenta">
                  {fotos.length}/{MAX_FOTOS}
                </span>
              </label>
            )}
          </div>
          {errorFotos && <p className="error">{errorFotos}</p>}
        </Seccion>

        <div className="trampa" aria-hidden>
          <label>
            Sitio web
            <input tabIndex={-1} autoComplete="off" value={form.sitioWeb} onChange={(e) => set('sitioWeb', e.target.value)} />
          </label>
        </div>

        <label className={'consentimiento' + (err('consentimiento') ? ' invalido' : '')}>
          <input type="checkbox" checked={form.consentimiento} onChange={(e) => set('consentimiento', e.target.checked)} aria-invalid={!!err('consentimiento')} />
          <span>
            {tercero
              ? 'Declaro que la información es verdadera, que reporto con conocimiento del asegurado y autorizo a ASSA Compañía de Seguros a usar estos datos para tramitar el reclamo, conforme a la Ley 81 de 2019 de protección de datos personales.'
              : 'Declaro que la información es verdadera y autorizo a ASSA Compañía de Seguros a usar mis datos para tramitar este reclamo, conforme a la Ley 81 de 2019 de protección de datos personales.'}
          </span>
        </label>
        {err('consentimiento') && <p className="error">{err('consentimiento')}</p>}

        {intentoEnvio && Object.keys(errores).length > 0 && (
          <p className="error resumen">Revise los campos marcados en rojo.</p>
        )}
        {errorEnvio && <p className="error resumen">{errorEnvio}</p>}

        <button type="submit" className="boton" disabled={enviando || procesandoFotos}>
          {enviando ? 'Enviando…' : 'Enviar reclamo'}
        </button>
      </form>
    </Marco>
  );
}
