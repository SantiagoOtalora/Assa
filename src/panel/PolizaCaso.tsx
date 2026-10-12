// Pestaña "Póliza" de la ficha: datos y documentos de la póliza desde el
// conector (api/polizas.ts), con el deducible de terremoto calculado.
import { useEffect, useState } from 'react';
import type { ReporteBI } from '../../api/panel';
import type { Poliza } from '../../api/_polizas';
import { COBERTURAS, tituloDe } from '../../shared/flujo.js';

const fmtUsd = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtDia = new Intl.DateTimeFormat('es-PA', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const dia = (iso: string) => fmtDia.format(new Date(`${iso}T00:00:00Z`));

export default function PolizaCaso({ r }: { r: ReporteBI }) {
  const [datos, setDatos] = useState<{ poliza: Poliza; fuente: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    fetch(`/api/polizas?numero=${encodeURIComponent(r.poliza)}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!vigente) return;
        if (res.ok) setDatos(json);
        else setError(json.error ?? 'No se pudo consultar la póliza.');
      })
      .catch(() => vigente && setError('No se pudo consultar la póliza.'));
    return () => {
      vigente = false;
    };
  }, [r.poliza]);

  if (error)
    return (
      <p className="aviso-gestion">
        {error} Póliza indicada en el reporte: <strong>{r.poliza}</strong>.
      </p>
    );
  if (!datos) return <p className="sec">Consultando la póliza {r.poliza}…</p>;

  const { poliza, fuente } = datos;
  const cubreFecha = poliza.vigenciaDesde <= r.fechaDano && r.fechaDano <= poliza.vigenciaHasta && poliza.estado !== 'cancelada';
  const deducible = (c: Poliza['coberturas'][number]) =>
    c.deducibleTerremoto ? Math.max(c.deducibleTerremoto.minimo, (c.sumaAsegurada * c.deducibleTerremoto.porcentaje) / 100) : 0;
  const reservaDe = (id: string) => r.coberturas.find((c) => c.id === id)?.reserva ?? null;
  const edificio = poliza.coberturas.find((c) => c.id === 'edificio');
  // Monto aproximado según el costo estimado del formulario (% de la suma asegurada del edificio).
  const estimado = edificio && r.costo != null ? (edificio.sumaAsegurada * r.costo) / 100 : null;

  return (
    <div className="gestion">
      {fuente === 'simulado' && (
        <p className="aviso-gestion">
          <strong>Datos simulados.</strong> La conexión con el sistema de pólizas de ASSA aún no está activa; estos datos son de prueba.
        </p>
      )}

      <section className="bloque">
        <h3>
          {poliza.producto} · {poliza.numero}
        </h3>
        <p className={cubreFecha ? 'aviso-ok' : 'error resumen'}>
          {cubreFecha
            ? `Póliza ${poliza.estado}: la vigencia cubre la fecha del daño (${dia(r.fechaDano)}).`
            : `Atención: la póliza está ${poliza.estado} y su vigencia (${dia(poliza.vigenciaDesde)} al ${dia(poliza.vigenciaHasta)}) no cubre la fecha del daño (${dia(r.fechaDano)}).`}
        </p>
        <dl className="datos">
          <div className="dato">
            <dt>Vigencia</dt>
            <dd>
              {dia(poliza.vigenciaDesde)} al {dia(poliza.vigenciaHasta)}
            </dd>
          </div>
          <div className="dato">
            <dt>Ramo</dt>
            <dd>{poliza.ramo}</dd>
          </div>
          <div className="dato">
            <dt>Asegurado</dt>
            <dd>
              {poliza.asegurado.nombre}
              <br />
              <span className="sec">{poliza.asegurado.identificacion}</span>
            </dd>
          </div>
          <div className="dato">
            <dt>Contacto en la póliza</dt>
            <dd>
              {poliza.asegurado.telefono} · {poliza.asegurado.correo}
            </dd>
          </div>
          <div className="dato">
            <dt>Corredor</dt>
            <dd>{poliza.corredor ? `${poliza.corredor.nombre} (${poliza.corredor.codigo})` : 'Directo'}</dd>
          </div>
          <div className="dato">
            <dt>Ubicación del riesgo</dt>
            <dd>{poliza.ubicacionRiesgo}</dd>
          </div>
        </dl>
        {poliza.asegurado.nombre.toLowerCase() !== r.nombre.toLowerCase() && (
          <p className="sec">El nombre en el reporte ({r.nombre}) no coincide con el de la póliza. Verifique la identidad.</p>
        )}
      </section>

      <section className="bloque">
        <h3>Coberturas y deducible de terremoto</h3>
        <div className="scroll-x">
          <table className="cola tabla-montos">
            <thead>
              <tr>
                <th>Cobertura</th>
                <th className="num">Suma asegurada</th>
                <th className="num">Deducible</th>
                <th className="num">Reserva</th>
              </tr>
            </thead>
            <tbody>
              {poliza.coberturas.map((c) => {
                const reserva = reservaDe(c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      {c.titulo}
                      {c.deducibleTerremoto && (
                        <div className="sec">
                          {c.deducibleTerremoto.porcentaje} % de la suma asegurada, mínimo {fmtUsd.format(c.deducibleTerremoto.minimo)}
                        </div>
                      )}
                    </td>
                    <td className="num">{fmtUsd.format(c.sumaAsegurada)}</td>
                    <td className="num">{c.deducibleTerremoto ? fmtUsd.format(deducible(c)) : '—'}</td>
                    <td className="num">
                      {reserva == null ? (
                        '—'
                      ) : (
                        <>
                          {fmtUsd.format(reserva)}
                          <div className={reserva > deducible(c) ? 'sec' : 'sin-contacto'}>
                            {reserva > deducible(c) ? 'supera el deducible' : 'no supera el deducible'}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {r.coberturas.some((c) => !poliza.coberturas.some((p) => p.id === c.id)) && (
          <p className="error">
            El análisis incluye coberturas que esta póliza no tiene:{' '}
            {r.coberturas
              .filter((c) => !poliza.coberturas.some((p) => p.id === c.id))
              .map((c) => tituloDe(COBERTURAS, c.id))
              .join(', ')}
            .
          </p>
        )}
        {estimado != null && edificio && (
          <p className="sec">
            Según el formulario, el costo estimado es {r.costo} % ≈ {fmtUsd.format(estimado)} sobre el edificio; el deducible del edificio es{' '}
            {fmtUsd.format(deducible(edificio))}: {estimado > deducible(edificio) ? 'probablemente lo supera' : 'probablemente no lo supera'}.
          </p>
        )}
      </section>

      <section className="bloque">
        <h3>Documentos de la póliza</h3>
        <ul className="lista-documentos">
          {poliza.documentos.map((d) => (
            <li key={d.id}>
              <a
                href={`/api/polizas?numero=${encodeURIComponent(poliza.numero)}&documento=${encodeURIComponent(d.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                {d.nombre}
              </a>
              <span className="sec">
                {d.tipo} · {dia(d.fecha)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
