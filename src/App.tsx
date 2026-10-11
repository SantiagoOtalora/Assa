import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  GRUPOS_DANO,
  HABITABILIDAD,
  LARGO_MAX_DESCRIPCION,
  LARGO_MIN_DESCRIPCION,
  MAX_FOTOS,
  PROVINCIAS,
  RE_CORREO,
  RE_TELEFONO,
  TIPOS_PROPIEDAD,
  normalizarTelefono,
} from '../shared/catalogos.js';
import { comprimirFoto } from './fotos';

type Form = {
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
  fechaDano: string;
  descripcion: string;
  consentimiento: boolean;
  sitioWeb: string;
};

type Foto = { archivo: File; url: string };

const VACIO: Form = {
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
  fechaDano: '',
  descripcion: '',
  consentimiento: false,
  sitioWeb: '',
};

const EJEMPLO_DESCRIPCION =
  'Ejemplo: Durante el sismo se abrieron grietas en diagonal en la pared de la sala, junto a la ventana. ' +
  'Se cayó parte del cielo raso de la cocina y la puerta del cuarto principal ya no cierra bien. ' +
  'También se rompió el televisor. No hubo personas heridas.';

function hoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function validar(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.nombre.trim()) e.nombre = 'Ingrese su nombre completo.';
  if (!f.poliza.trim()) e.poliza = 'Ingrese su número de póliza.';
  if (!RE_CORREO.test(f.correo.trim())) e.correo = 'Ingrese un correo válido.';
  if (!RE_TELEFONO.test(normalizarTelefono(f.telefono))) e.telefono = 'Ingrese un teléfono de 7 u 8 dígitos.';
  if (!f.provincia) e.provincia = 'Seleccione la provincia.';
  if (!f.distrito) e.distrito = 'Seleccione el distrito.';
  if (!f.direccion.trim()) e.direccion = 'Indique la dirección o un punto de referencia.';
  if (!f.tipoPropiedad) e.tipoPropiedad = 'Seleccione el tipo de inmueble.';
  if (!f.tiposDano.length) e.tiposDano = 'Seleccione al menos un tipo de daño.';
  if (!f.habitabilidad) e.habitabilidad = 'Indique el estado del inmueble.';
  if (!f.fechaDano) e.fechaDano = 'Indique la fecha.';
  if (f.descripcion.trim().length < LARGO_MIN_DESCRIPCION)
    e.descripcion = `Cuéntenos un poco más (mínimo ${LARGO_MIN_DESCRIPCION} caracteres).`;
  if (!f.consentimiento) e.consentimiento = 'Debe aceptar para poder enviar el reclamo.';
  return e;
}

export default function App() {
  const [form, setForm] = useState<Form>(VACIO);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [procesandoFotos, setProcesandoFotos] = useState(false);
  const [errorFotos, setErrorFotos] = useState('');
  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [numero, setNumero] = useState('');

  const errores = useMemo(() => validar(form), [form]);
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
          <h2>Recibimos su reclamo</h2>
          <p>Su número de reclamo es</p>
          <p className="numero-reclamo">{numero}</p>
          <p>
            Un ajustador se comunicará con usted al <strong>{form.telefono}</strong> o a{' '}
            <strong>{form.correo}</strong> para coordinar la inspección. Guarde este número para dar seguimiento.
          </p>
          {form.habitabilidad === 'no' && (
            <p className="aviso">
              Si no es seguro permanecer en el inmueble, salga del lugar y siga las indicaciones de SINAPROC.
              En caso de emergencia llame al <strong>911</strong>.
            </p>
          )}
          <button
            type="button"
            className="boton secundario"
            onClick={() => {
              setForm(VACIO);
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
          Lamentamos lo ocurrido. Complete este formulario y nuestro equipo de reclamos se comunicará con usted.
          Le tomará unos 5 minutos.
        </p>
      </section>

      <form className="tarjeta" onSubmit={enviar} noValidate>
        <Seccion n={1} titulo="Datos del asegurado">
          <Campo id="nombre" etiqueta="Nombre completo" error={err('nombre')}>
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
            <Campo id="correo" etiqueta="Correo electrónico" error={err('correo')}>
              <input id="correo" type="email" autoComplete="email" inputMode="email" value={form.correo} onChange={(e) => set('correo', e.target.value)} aria-invalid={!!err('correo')} />
            </Campo>
            <Campo id="telefono" etiqueta="Teléfono" error={err('telefono')}>
              <div className="prefijo">
                <span>+507</span>
                <input id="telefono" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="6000-0000" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} aria-invalid={!!err('telefono')} />
              </div>
            </Campo>
          </div>
        </Seccion>

        <Seccion n={2} titulo="Ubicación del inmueble">
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

        <Seccion n={3} titulo="Daños">
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

          <Grupo etiqueta="¿Se puede habitar o usar el inmueble?" error={err('habitabilidad')}>
            <div className="lista-radio" role="radiogroup">
              {HABITABILIDAD.map((h) => (
                <label key={h.id} className={form.habitabilidad === h.id ? 'activo' : ''}>
                  <input type="radio" name="habitabilidad" checked={form.habitabilidad === h.id} onChange={() => set('habitabilidad', h.id)} aria-invalid={!!err('habitabilidad')} />
                  {h.titulo}
                </label>
              ))}
            </div>
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

        <Seccion n={4} titulo="Fotos de los daños" opcional>
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
            Declaro que la información es verdadera y autorizo a ASSA Compañía de Seguros a usar mis datos para tramitar
            este reclamo, conforme a la Ley 81 de 2019 de protección de datos personales.
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

function Marco({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="encabezado">
        <div className="contenedor">
          <span className="logo">ASSA</span>
          <span className="logo-sub">Compañía de Seguros · Panamá</span>
        </div>
      </header>
      <main className="contenedor">{children}</main>
      <footer className="pie">
        <div className="contenedor">
          <p>¿Emergencia? Llame al 911. Para consultas sobre su póliza contacte a su corredor o a ASSA.</p>
        </div>
      </footer>
    </>
  );
}

function Seccion({ n, titulo, opcional, children }: { n: number; titulo: string; opcional?: boolean; children: ReactNode }) {
  return (
    <section className="seccion">
      <h2>
        <span className="paso">{n}</span>
        {titulo}
        {opcional && <span className="opcional">Opcional</span>}
      </h2>
      {children}
    </section>
  );
}

function Campo(props: {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  opcional?: boolean;
  angosto?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={'campo' + (props.error ? ' invalido' : '') + (props.angosto ? ' angosto' : '')}>
      <label htmlFor={props.id}>
        {props.etiqueta}
        {props.opcional && <span className="opcional">Opcional</span>}
      </label>
      {props.ayuda && <span className="ayuda">{props.ayuda}</span>}
      {props.children}
      {props.error && <span className="error">{props.error}</span>}
    </div>
  );
}

function Grupo(props: { etiqueta: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <div className={'campo' + (props.error ? ' invalido' : '')}>
      <span className="etiqueta">{props.etiqueta}</span>
      {props.ayuda && <span className="ayuda">{props.ayuda}</span>}
      {props.children}
      {props.error && <span className="error">{props.error}</span>}
    </div>
  );
}
