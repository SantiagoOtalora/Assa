// Formulario 2 (/formulario2): reporte de daños de un reclamo que ya existe, sin acceso.
// Se guarda en su propia tabla (api/formulario2.ts). Conserva un borrador en el
// dispositivo y una ref fija por reporte, para que un reenvío no duplique.
import { useEffect, useState, type FormEvent } from 'react';
import { GRUPOS_DANO, HABITABILIDAD, RIESGOS } from '../../shared/catalogos.js';
import { Campo, Grupo, Marco, Seccion } from '../marco';

const LARGO_MAX = 1500;
const CLAVE_BORRADOR = 'formulario2-borrador';

type Form = {
  ref: string;
  reclamo: string;
  poliza: string;
  unidad: string;
  tiposDano: string[];
  habitabilidad: string;
  riesgos: string[];
  sinRiesgos: boolean;
  descripcion: string;
  sitioWeb: string;
};

const nuevoForm = (): Form => ({
  ref: crypto.randomUUID(),
  reclamo: '',
  poliza: '',
  unidad: '',
  tiposDano: [],
  habitabilidad: '',
  riesgos: [],
  sinRiesgos: false,
  descripcion: '',
  sitioWeb: '',
});

function leerBorrador(): Form | null {
  try {
    const json = localStorage.getItem(CLAVE_BORRADOR);
    return json ? { ...nuevoForm(), ...JSON.parse(json) } : null;
  } catch {
    return null;
  }
}

function guardarBorrador(f: Form | null) {
  try {
    if (f) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(f));
    else localStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // Sin almacenamiento (modo privado): el formulario funciona igual.
  }
}

// Mismas reglas que el servidor (api/_formulario2.ts).
function validar(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.reclamo.trim()) e.reclamo = 'Escriba el número de reclamo.';
  if (!f.poliza.trim()) e.poliza = 'Escriba el número de póliza.';
  if (!f.tiposDano.length) e.tiposDano = 'Marque al menos un tipo de daño.';
  if (!f.habitabilidad) e.habitabilidad = 'Seleccione una opción.';
  if (!f.riesgos.length && !f.sinRiesgos) e.riesgos = 'Marque al menos una opción.';
  if (f.tiposDano.includes('otro') && !f.descripcion.trim()) e.descripcion = 'Describa el daño que marcó como "Otro tipo de daño".';
  return e;
}

export default function Formulario2() {
  const [form, setForm] = useState<Form>(() => leerBorrador() ?? nuevoForm());
  const [avisoBorrador, setAvisoBorrador] = useState(() => !!leerBorrador());
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [enviado, setEnviado] = useState<{ numero: string; resumen: string } | null>(null);

  useEffect(() => {
    if (!enviado) guardarBorrador(form);
  }, [form, enviado]);

  const errores = validar(form);
  const err = (k: keyof Form) => (intento ? errores[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const alternar = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const otro = form.tiposDano.includes('otro');
  const peligro = form.riesgos.some((r) => r !== 'agua');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIntento(true);
    setErrorEnvio('');
    if (Object.keys(errores).length) {
      requestAnimationFrame(() => document.querySelector('.invalido')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch('/api/formulario2', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No pudimos registrar su reporte.');
      guardarBorrador(null);
      const unidad = form.unidad.trim();
      setEnviado({ numero: json.numero, resumen: `Reclamo ${form.reclamo.trim()} · Póliza ${form.poliza.trim()}${unidad ? ` · Unidad ${unidad}` : ''}` });
      window.scrollTo({ top: 0 });
    } catch (ex) {
      setErrorEnvio(ex instanceof Error ? ex.message : 'No pudimos registrar su reporte.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <Marco>
        <section className="tarjeta exito">
          <div className="exito-icono" aria-hidden>
            ✓
          </div>
          <h2>¡Gracias por su reporte!</h2>
          <p>Registramos los daños de su inmueble. Su número de reporte es</p>
          <p className="numero-reclamo">{enviado.numero}</p>
          <p>{enviado.resumen}</p>
          {(form.habitabilidad === 'no' || peligro) && (
            <p className="aviso">
              Si no es seguro permanecer en el inmueble, salga del lugar y siga las indicaciones de SINAPROC. En caso de emergencia llame al{' '}
              <strong>911</strong>.
            </p>
          )}
          <button
            type="button"
            className="boton secundario"
            onClick={() => {
              setForm(nuevoForm());
              setIntento(false);
              setAvisoBorrador(false);
              setEnviado(null);
            }}
          >
            Crear otro reporte
          </button>
        </section>
      </Marco>
    );
  }

  return (
    <Marco>
      <section className="intro">
        <h1>Reporte de daños por sismo</h1>
        <p>Complete este formulario para reportar los daños de su inmueble. Todos los campos son obligatorios, salvo los marcados como opcionales.</p>
        <p className="alerta-911">
          <strong>¿Hay olor a gas, cables expuestos o riesgo de derrumbe?</strong> Salga del inmueble y llame al <a href="tel:911">911</a> antes de
          llenar este formulario.
        </p>
      </section>

      {avisoBorrador && (
        <p className="aviso-borrador">
          Recuperamos el reporte que dejó sin enviar en este dispositivo.
          <button
            type="button"
            onClick={() => {
              setForm(nuevoForm());
              setIntento(false);
              setAvisoBorrador(false);
            }}
          >
            Empezar de nuevo
          </button>
        </p>
      )}

      <form className="tarjeta" onSubmit={enviar} noValidate>
        <Seccion n={1} titulo="Datos del reclamo">
          <div className="fila">
            <Campo id="reclamo" etiqueta="Número de reclamo" error={err('reclamo')}>
              <input id="reclamo" value={form.reclamo} onChange={(e) => set('reclamo', e.target.value)} autoComplete="off" maxLength={40} aria-invalid={!!err('reclamo')} />
            </Campo>
            <Campo id="poliza" etiqueta="Número de póliza" ayuda="Tal como aparece en las condiciones particulares o carátula de la póliza" error={err('poliza')}>
              <input id="poliza" value={form.poliza} onChange={(e) => set('poliza', e.target.value)} autoComplete="off" maxLength={40} aria-invalid={!!err('poliza')} />
            </Campo>
            <Campo id="unidad" etiqueta="Unidad o certificado" opcional>
              <input id="unidad" value={form.unidad} onChange={(e) => set('unidad', e.target.value)} autoComplete="off" maxLength={40} />
            </Campo>
          </div>
        </Seccion>

        <Seccion n={2} titulo="Daños">
          <Grupo etiqueta="¿Qué tipo de daños se observan?" ayuda="Puede marcar varios" error={err('tiposDano')}>
            {GRUPOS_DANO.map((g) => (
              <fieldset key={g.grupo} className="grupo-dano">
                <legend>{g.grupo}</legend>
                <div className="opciones-dano">
                  {g.tipos.map((t) => {
                    const activo = form.tiposDano.includes(t.id);
                    return (
                      <label key={t.id} className={'opcion-dano' + (activo ? ' activo' : '')}>
                        <input type="checkbox" checked={activo} onChange={() => set('tiposDano', alternar(form.tiposDano, t.id))} aria-invalid={!!err('tiposDano')} />
                        <span className="opcion-titulo">{t.titulo}</span>
                        <span className="opcion-detalle">
                          {t.id === 'otro' ? 'Detalle el daño en la "Descripción de lo ocurrido"' : t.detalle}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </Grupo>
        </Seccion>

        <Seccion n={3} titulo="Situación actual">
          <Grupo etiqueta="¿Se puede habitar o usar el inmueble?" error={err('habitabilidad')}>
            <div className="lista-radio" role="radiogroup">
              {HABITABILIDAD.map((h) => (
                <label key={h.id} className={form.habitabilidad === h.id ? 'activo' : ''}>
                  <input
                    type="radio"
                    name="habitabilidad"
                    checked={form.habitabilidad === h.id}
                    onChange={() => set('habitabilidad', h.id)}
                    aria-invalid={!!err('habitabilidad')}
                  />
                  {h.titulo}
                </label>
              ))}
            </div>
          </Grupo>

          <Grupo etiqueta="¿Existe alguna de estas situaciones en este momento?" ayuda="Puede marcar varias" error={err('riesgos')}>
            <div className="lista-radio">
              {RIESGOS.map((r) => (
                <label key={r.id} className={form.riesgos.includes(r.id) ? 'activo riesgo' : ''}>
                  <input
                    type="checkbox"
                    checked={form.riesgos.includes(r.id)}
                    onChange={() => setForm((f) => ({ ...f, riesgos: alternar(f.riesgos, r.id), sinRiesgos: false }))}
                    aria-invalid={!!err('riesgos')}
                  />
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
                Ninguna de las anteriores
              </label>
            </div>
            {peligro && (
              <p className="aviso" role="alert">
                <strong>Por su seguridad:</strong> salga del inmueble y llame a los bomberos o al <strong>911</strong> antes de continuar con el reporte.
              </p>
            )}
          </Grupo>
        </Seccion>

        <Seccion n={4} titulo="Descripción de lo ocurrido" opcional={!otro}>
          <Campo id="descripcion" etiqueta="Cuéntenos qué pasó y qué daños observa" error={err('descripcion')}>
            <textarea
              id="descripcion"
              rows={6}
              maxLength={LARGO_MAX}
              placeholder="Ej. Durante el sismo se abrió una grieta en la pared de la sala y se cayó parte del cielo raso del pasillo."
              value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              aria-invalid={!!err('descripcion')}
            />
            <span className="contador">
              {form.descripcion.length}/{LARGO_MAX}
            </span>
          </Campo>
        </Seccion>

        <div className="trampa" aria-hidden>
          <label>
            Sitio web
            <input tabIndex={-1} autoComplete="off" value={form.sitioWeb} onChange={(e) => set('sitioWeb', e.target.value)} />
          </label>
        </div>

        {intento && Object.keys(errores).length > 0 && <p className="error resumen">Revise los campos marcados en rojo.</p>}
        {errorEnvio && <p className="error resumen">{errorEnvio}</p>}

        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </form>
    </Marco>
  );
}
