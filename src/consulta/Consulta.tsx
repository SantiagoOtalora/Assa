import { useEffect, useState, type FormEvent } from 'react';

type Resultado = {
  numero: string;
  fase: string;
  faseDesde: string;
  recibido: string;
  pasos: { id: string; titulo: string; abierto: boolean }[];
};

const fmt = new Intl.DateTimeFormat('es-PA', { timeZone: 'America/Panama', day: 'numeric', month: 'long', year: 'numeric' });

const DESCRIPCION: Record<string, string> = {
  ingresado: 'Recibimos su reporte y está en espera de revisión.',
  esperando_info: 'Necesitamos información o documentos adicionales. Revise su correo o comuníquese con su corredor.',
  en_analisis: 'Un analista está revisando la información de su reporte.',
  con_ajustador: 'Su caso está con un analista o ajustador para la evaluación de los daños.',
  pagado: 'Su reclamo fue aprobado y pagado.',
  declinado: 'Su reclamo fue revisado y no procede. Puede consultar el detalle con su corredor o con ASSA.',
};

export default function Consulta() {
  const params = new URLSearchParams(location.search);
  const [numero, setNumero] = useState(params.get('numero') ?? '');
  const [poliza, setPoliza] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState('');
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    document.getElementById(numero ? 'poliza' : 'numero')?.focus();
  }, []);

  async function consultar(e: FormEvent) {
    e.preventDefault();
    setBuscando(true);
    setError('');
    setResultado(null);
    const res = await fetch('/api/consulta', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ numero, poliza }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBuscando(false);
    if (res?.ok) setResultado(json);
    else setError(json.error ?? 'No pudimos hacer la consulta. Intente de nuevo en unos minutos.');
  }

  // Pagado y declinado son excluyentes: mientras el caso está abierto se muestra
  // un último paso "Resuelto"; al terminar, el resultado real.
  const final = resultado?.pasos.find((p) => !p.abierto && p.id === resultado.fase);
  const pasos = resultado
    ? [
        // "Esperando información" no es un paso obligatorio: solo se muestra si el caso está ahí.
        ...resultado.pasos.filter((p) => p.abierto && (p.id !== 'esperando_info' || resultado.fase === 'esperando_info')),
        final ?? { id: 'resuelto', titulo: 'Resuelto (pagado o declinado)', abierto: false },
      ]
    : [];
  const actual = pasos.findIndex((p) => p.id === resultado?.fase);

  return (
    <>
      <header className="encabezado">
        <div className="contenedor">
          <img className="logo" src="/logo-white.svg" alt="ASSA Compañía de Seguros" width="152" height="36" />
          <span className="logo-sub">Compañía de Seguros · Panamá</span>
        </div>
      </header>
      <main className="contenedor">
        <section className="intro">
          <h1>Consultar mi reporte</h1>
          <p>Ingrese el número de reporte que recibió y el número de póliza para ver en qué fase está.</p>
        </section>

        <form className="tarjeta consulta" onSubmit={consultar}>
          <div className="fila">
            <div className="campo">
              <label htmlFor="numero">Número de reporte</label>
              <input id="numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej. TRM-000123" autoComplete="off" />
            </div>
            <div className="campo">
              <label htmlFor="poliza">Número de póliza</label>
              <input id="poliza" value={poliza} onChange={(e) => setPoliza(e.target.value)} placeholder="Ej. 02-B-12345" autoComplete="off" />
            </div>
          </div>
          {error && <p className="error resumen">{error}</p>}
          <button className="boton" disabled={buscando || !numero.trim() || !poliza.trim()}>
            {buscando ? 'Consultando…' : 'Consultar'}
          </button>
        </form>

        {resultado && (
          <section className="tarjeta resultado-consulta" aria-live="polite">
            <p className="sec">Reporte</p>
            <h2>{resultado.numero}</h2>
            <p className="sec">Recibido el {fmt.format(new Date(resultado.recibido))}</p>
            <ol className="fases">
              {pasos.map((p, i) => (
                <li key={p.id} className={i < actual ? 'hecha' : i === actual ? 'actual' : ''}>
                  <span className="fase-marca" aria-hidden>
                    {i < actual ? '✓' : i + 1}
                  </span>
                  <div>
                    <strong>{p.titulo}</strong>
                    {i === actual && (
                      <>
                        <p>{DESCRIPCION[p.id]}</p>
                        <p className="sec">Desde el {fmt.format(new Date(resultado.faseDesde))}</p>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="pie-consulta">
          ¿Aún no ha reportado? <a href="/">Reporte los daños aquí</a>.
        </p>
      </main>
    </>
  );
}
