// Tarea diaria (Vercel Cron, ver vercel.json):
// 1. Carga a la tabla los reclamos que quedaron en pendientes/ porque la base de
//    datos no respondía. Los JSON no se borran: quedan como copia.
// 2. Lee los correos nuevos del buzón (además de la sincronización desde el panel).
// 3. Guarda una copia completa de los reportes, su historial de gestión y los
//    correos recibidos en respaldos/AAAA-MM-DD.json.
import { get, list, put } from '@vercel/blob';
import { sincronizarBuzon } from './_correo.js';
import { asegurarTabla, conReintentos, guardarReclamo, sql, type Reclamo } from './_db.js';

async function leerJson(pathname: string): Promise<Reclamo> {
  const res = await get(pathname, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) throw new Error(`No se pudo leer ${pathname}`);
  return JSON.parse(await new Response(res.stream).text());
}

async function cargarPendientes() {
  let cargados = 0;
  const errores: string[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await list({ prefix: 'pendientes/', cursor, limit: 1000 });
    for (const b of pagina.blobs) {
      try {
        await guardarReclamo(await leerJson(b.pathname));
        cargados++;
      } catch (e) {
        console.error('No se pudo cargar', b.pathname, e);
        errores.push(b.pathname);
      }
    }
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);
  return { cargados, errores };
}

async function copiarTabla() {
  await asegurarTabla();
  const filas = await sql`SELECT * FROM reclamos_terremoto ORDER BY id`;
  const eventos = await sql`SELECT * FROM reclamo_eventos ORDER BY id`;
  const correos = await sql`SELECT * FROM correos_recibidos ORDER BY guardado_en`;
  const ruta = `respaldos/${new Date().toISOString().slice(0, 10)}.json`;
  await conReintentos(() =>
    put(ruta, JSON.stringify({ generado: new Date().toISOString(), total: filas.length, filas, eventos, correos }), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    }),
  );
  return { ruta, total: filas.length, eventos: eventos.length, correos: correos.length };
}

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 });
  }
  const pendientes = await cargarPendientes();
  const correo = await sincronizarBuzon(100).catch((e) => {
    console.error('No se pudo leer el buzón', e);
    return { error: String(e) };
  });
  const respaldo = await copiarTabla();
  console.log('Respaldo', { pendientes, correo, respaldo });
  return Response.json({ pendientes, correo, respaldo }, { status: pendientes.errores.length ? 500 : 200 });
}
