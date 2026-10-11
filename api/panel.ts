// API del panel de reportes (BI). Protegida con la clave PANEL_CLAVE.
//   POST   /api/panel            { clave }  -> inicia sesión (cookie de 12 h)
//   DELETE /api/panel                       -> cierra sesión
//   GET    /api/panel                       -> todos los reportes con sus motivos de prioridad
//   GET    /api/panel?foto=reclamos/...     -> una foto privada
// Solo lectura: no modifica ni borra reportes.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { get, list } from '@vercel/blob';
import { evaluarPrioridad } from '../shared/catalogos.js';
import { asegurarTabla, sql, type Reclamo } from './_db.js';

const COOKIE = 'panel_sesion';
const DURACION_MS = 12 * 60 * 60 * 1000;

function firmar(valor: string, clave: string) {
  return createHmac('sha256', clave).update(valor).digest('base64url');
}

function iguales(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function sesionValida(request: Request, clave: string) {
  const cookie = request.headers.get('cookie') ?? '';
  const valor = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!valor) return false;
  const [vence, firma] = valor.split('.');
  return Number(vence) > Date.now() && !!firma && iguales(firma, firmar(vence, clave));
}

function cookie(valor: string, maxAge: number) {
  return `${COOKIE}=${valor}; Path=/api/panel; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function POST(request: Request) {
  const clave = process.env.PANEL_CLAVE;
  if (!clave) return Response.json({ error: 'El panel no está configurado.' }, { status: 503 });
  const { clave: intento } = await request.json().catch(() => ({ clave: '' }));
  if (typeof intento !== 'string' || !iguales(intento, clave)) {
    await new Promise((ok) => setTimeout(ok, 800));
    return Response.json({ error: 'Clave incorrecta.' }, { status: 401 });
  }
  const vence = String(Date.now() + DURACION_MS);
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': cookie(`${vence}.${firmar(vence, clave)}`, DURACION_MS / 1000) },
  });
}

export function DELETE() {
  return new Response(null, { status: 204, headers: { 'set-cookie': cookie('', 0) } });
}

export type ReporteBI = {
  numero: string;
  ref: string | null;
  pendiente: boolean;
  creadoEn: string;
  estado: string;
  prioridad: string;
  motivos: string[];
  nombre: string;
  poliza: string;
  unidad: string | null;
  correo: string;
  telefono: string;
  provincia: string;
  distrito: string;
  direccion: string;
  tipoPropiedad: string;
  tiposDano: string[];
  habitabilidad: string;
  riesgos: string[];
  extension: string;
  operacion: string | null;
  fechaDano: string;
  descripcion: string;
  fotos: string[];
};

async function leerReportes(): Promise<ReporteBI[]> {
  await asegurarTabla();
  const filas = await sql`
    SELECT numero, ref, creado_en, estado, prioridad, nombre, poliza, unidad, correo, telefono,
           provincia, distrito, direccion, tipo_propiedad, tipos_dano, habitabilidad, riesgos,
           extension, operacion, fecha_dano::text AS fecha_dano, descripcion, fotos
    FROM reclamos_terremoto
    ORDER BY id`;

  const reportes: ReporteBI[] = filas.map((f) => {
    const datos = {
      habitabilidad: f.habitabilidad,
      riesgos: f.riesgos,
      tiposDano: f.tipos_dano,
      extension: f.extension,
      operacion: f.operacion ?? '',
    };
    return {
      numero: f.numero,
      ref: f.ref,
      pendiente: false,
      creadoEn: new Date(f.creado_en).toISOString(),
      estado: f.estado,
      prioridad: f.prioridad,
      motivos: evaluarPrioridad(datos).motivos,
      nombre: f.nombre,
      poliza: f.poliza,
      unidad: f.unidad,
      correo: f.correo,
      telefono: f.telefono,
      provincia: f.provincia,
      distrito: f.distrito,
      direccion: f.direccion,
      tipoPropiedad: f.tipo_propiedad,
      tiposDano: f.tipos_dano,
      habitabilidad: f.habitabilidad,
      riesgos: f.riesgos,
      extension: f.extension,
      operacion: f.operacion,
      fechaDano: f.fecha_dano,
      descripcion: f.descripcion,
      fotos: f.fotos,
    };
  });

  // Reportes guardados en pendientes/ que el cron aún no cargó a la tabla.
  const refs = new Set(reportes.map((r) => r.ref));
  let cursor: string | undefined;
  do {
    const pagina = await list({ prefix: 'pendientes/', cursor, limit: 1000 });
    for (const b of pagina.blobs) {
      const ref = b.pathname.slice('pendientes/'.length, -'.json'.length);
      if (refs.has(ref)) continue;
      const res = await get(b.pathname, { access: 'private', useCache: false });
      if (!res || res.statusCode !== 200) continue;
      const r: Reclamo = JSON.parse(await new Response(res.stream).text());
      reportes.push({
        ...r,
        numero: `P-${r.ref.slice(0, 8).toUpperCase()}`,
        pendiente: true,
        creadoEn: r.recibidoEn,
        estado: 'recibido',
        motivos: evaluarPrioridad(r).motivos,
      });
    }
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);

  return reportes;
}

export async function GET(request: Request) {
  const clave = process.env.PANEL_CLAVE;
  if (!clave || !sesionValida(request, clave)) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const foto = new URL(request.url).searchParams.get('foto');
  if (foto) {
    if (!/^reclamos\/[\w./-]+\.jpg$/.test(foto) || foto.includes('..')) return new Response('Ruta inválida', { status: 400 });
    const res = await get(foto, { access: 'private' });
    if (!res || res.statusCode !== 200) return new Response('No encontrada', { status: 404 });
    return new Response(res.stream, {
      headers: { 'content-type': res.blob.contentType, 'cache-control': 'private, max-age=3600' },
    });
  }

  const reportes = await leerReportes();
  return Response.json({ generado: new Date().toISOString(), reportes }, { headers: { 'cache-control': 'no-store' } });
}
