// Consulta pública del estado de un reclamo (asegurados, corredores, comercial).
//   POST /api/consulta { numero, poliza } -> fase actual y fechas, sin datos personales.
// Ambos datos deben coincidir; si no, responde lo mismo que si no existiera.
import { get, list } from '@vercel/blob';
import { ESTADOS, normalizarEstado } from '../shared/flujo.js';
import { asegurarTabla, sql, type Reclamo } from './_db.js';
import { demasiadas, dentroDelLimite } from './_limites.js';

const noEncontrado = async () => {
  await new Promise((ok) => setTimeout(ok, 500));
  return Response.json({ error: 'No encontramos un reporte con ese número y póliza.' }, { status: 404 });
};

export async function POST(request: Request) {
  if (!(await dentroDelLimite(request, 'consulta'))) {
    return demasiadas('Hizo muchas consultas en poco tiempo. Intente de nuevo en unos minutos.');
  }
  const cuerpo = await request.json().catch(() => null);
  const numero = String(cuerpo?.numero ?? '').trim().toUpperCase();
  const poliza = String(cuerpo?.poliza ?? '').trim().toUpperCase();
  if (!numero || !poliza || numero.length > 20 || poliza.length > 40) return noEncontrado();

  // Reporte guardado en respaldo (P-XXXXXXXX): aún no cargado a la base de datos.
  if (/^P-[0-9A-F]{8}$/.test(numero)) {
    const { blobs } = await list({ prefix: `pendientes/${numero.slice(2).toLowerCase()}`, limit: 5 });
    for (const b of blobs) {
      const res = await get(b.pathname, { access: 'private', useCache: false });
      if (!res || res.statusCode !== 200) continue;
      const r: Reclamo = JSON.parse(await new Response(res.stream).text());
      if (r.poliza.toUpperCase() !== poliza) continue;
      return Response.json({ numero, fase: 'ingresado', faseDesde: r.recibidoEn, recibido: r.recibidoEn, pasos: ESTADOS });
    }
    return noEncontrado();
  }

  if (!/^TRM-\d{6,}$/.test(numero)) return noEncontrado();
  await asegurarTabla();
  const [r] = await sql`
    SELECT numero, estado, creado_en, coalesce(fase_desde, creado_en) AS fase_desde
    FROM reclamos_terremoto
    WHERE numero = ${numero} AND upper(poliza) = ${poliza}`;
  if (!r) return noEncontrado();
  return Response.json(
    {
      numero: r.numero,
      fase: normalizarEstado(r.estado),
      faseDesde: new Date(r.fase_desde).toISOString(),
      recibido: new Date(r.creado_en).toISOString(),
      pasos: ESTADOS,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
