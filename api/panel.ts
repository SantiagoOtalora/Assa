// API del panel de reportes (BI). Protegida con la clave PANEL_CLAVE.
//   POST   /api/panel            { clave }  -> inicia sesión (cookie de 12 h)
//   DELETE /api/panel                       -> cierra sesión
//   GET    /api/panel                       -> todos los reportes con sus motivos de prioridad
//   GET    /api/panel?foto=reclamos/...     -> una foto privada
//   GET    /api/panel?documento=documentos/... -> un documento privado del caso
// Solo lectura. La gestión de casos (estado, notas, comunicaciones) está en api/gestion.ts.
import { get, list } from '@vercel/blob';
import { evaluarPrioridad } from '../shared/catalogos.js';
import { normalizarEstado, type CoberturaAfectada } from '../shared/flujo.js';
import { asegurarTabla, sql, type Reclamo } from './_db.js';
import { cookieCierre, cookieSesion, iguales, noAutorizado, sesionValida } from './_sesion.js';

export async function POST(request: Request) {
  const clave = process.env.PANEL_CLAVE;
  if (!clave) return Response.json({ error: 'El panel no está configurado.' }, { status: 503 });
  const { clave: intento } = await request.json().catch(() => ({ clave: '' }));
  if (typeof intento !== 'string' || !iguales(intento, clave)) {
    await new Promise((ok) => setTimeout(ok, 800));
    return Response.json({ error: 'Clave incorrecta.' }, { status: 401 });
  }
  return new Response(null, { status: 204, headers: { 'set-cookie': cookieSesion(clave) } });
}

export function DELETE() {
  return new Response(null, { status: 204, headers: { 'set-cookie': cookieCierre() } });
}

export type ReporteBI = {
  id: number | null;
  numero: string;
  ref: string | null;
  pendiente: boolean;
  creadoEn: string;
  estado: string;
  asignadoA: string | null;
  fechaInspeccion: string | null;
  motivoCierre: string | null;
  actualizadoEn: string | null;
  ultimoContacto: string | null;
  contactado: boolean;
  comunicaciones: number;
  documentos: number;
  faseDesde: string;
  reportadoPor: string;
  reportanteNombre: string | null;
  reportanteCodigo: string | null;
  reportanteCorreo: string | null;
  reportanteTelefono: string | null;
  causa: string | null;
  coberturas: CoberturaAfectada[];
  analisisVersion: number;
  prioridad: string;
  costo: number;
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
    SELECT r.id, r.numero, r.ref, r.creado_en, r.estado, r.nombre, r.poliza, r.unidad, r.correo, r.telefono,
           r.provincia, r.distrito, r.direccion, r.tipo_propiedad, r.tipos_dano, r.habitabilidad, r.riesgos,
           r.extension, r.operacion, r.fecha_dano::text AS fecha_dano, r.descripcion, r.fotos,
           r.asignado_a, r.fecha_inspeccion::text AS fecha_inspeccion, r.motivo_cierre, r.actualizado_en,
           c.ultimo_contacto, coalesce(c.contactado, false) AS contactado, coalesce(c.total, 0)::int AS comunicaciones,
           coalesce(d.total, 0)::int AS documentos, coalesce(r.fase_desde, r.creado_en) AS fase_desde,
           r.reportado_por, r.reportante_nombre, r.reportante_codigo, r.reportante_correo, r.reportante_telefono,
           r.causa, r.coberturas, r.analisis_version
    FROM reclamos_terremoto r
    LEFT JOIN (
      SELECT reclamo_id,
             max(creado_en) AS ultimo_contacto,
             bool_or(datos->>'resultado' IN ('contactado', 'respuesta_recibida')) AS contactado,
             count(*) AS total
      FROM reclamo_eventos
      WHERE tipo = 'comunicacion'
      GROUP BY reclamo_id
    ) c ON c.reclamo_id = r.id
    LEFT JOIN (
      SELECT reclamo_id, count(*) AS total FROM reclamo_eventos WHERE tipo = 'documento' GROUP BY reclamo_id
    ) d ON d.reclamo_id = r.id
    ORDER BY r.id`;

  const reportes: ReporteBI[] = filas.map((f) => {
    const datos = {
      tipoPropiedad: f.tipo_propiedad,
      habitabilidad: f.habitabilidad,
      riesgos: f.riesgos,
      tiposDano: f.tipos_dano,
      extension: f.extension,
      operacion: f.operacion ?? '',
    };
    return {
      id: f.id,
      numero: f.numero,
      ref: f.ref,
      pendiente: false,
      creadoEn: new Date(f.creado_en).toISOString(),
      estado: normalizarEstado(f.estado),
      asignadoA: f.asignado_a,
      fechaInspeccion: f.fecha_inspeccion,
      motivoCierre: f.motivo_cierre,
      actualizadoEn: f.actualizado_en ? new Date(f.actualizado_en).toISOString() : null,
      ultimoContacto: f.ultimo_contacto ? new Date(f.ultimo_contacto).toISOString() : null,
      contactado: f.contactado,
      comunicaciones: f.comunicaciones,
      documentos: f.documentos,
      faseDesde: new Date(f.fase_desde).toISOString(),
      reportadoPor: f.reportado_por,
      reportanteNombre: f.reportante_nombre,
      reportanteCodigo: f.reportante_codigo,
      reportanteCorreo: f.reportante_correo,
      reportanteTelefono: f.reportante_telefono,
      causa: f.causa,
      coberturas: f.coberturas,
      analisisVersion: f.analisis_version,
      // La prioridad se recalcula con las reglas vigentes; la guardada no se modifica.
      ...evaluarPrioridad(datos),
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
        id: null,
        numero: `P-${r.ref.slice(0, 8).toUpperCase()}`,
        pendiente: true,
        creadoEn: r.recibidoEn,
        estado: 'ingresado',
        asignadoA: null,
        fechaInspeccion: null,
        motivoCierre: null,
        actualizadoEn: null,
        ultimoContacto: null,
        contactado: false,
        comunicaciones: 0,
        documentos: 0,
        faseDesde: r.recibidoEn,
        reportadoPor: r.reportadoPor ?? 'asegurado',
        reportanteNombre: r.reportanteNombre || null,
        reportanteCodigo: r.reportanteCodigo || null,
        reportanteCorreo: r.reportanteCorreo || null,
        reportanteTelefono: r.reportanteTelefono || null,
        causa: null,
        coberturas: [],
        analisisVersion: 0,
        ...evaluarPrioridad(r),
      });
    }
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);

  return reportes;
}

export async function GET(request: Request) {
  if (!sesionValida(request)) return noAutorizado();

  // Fotos del formulario (?foto=) y documentos del caso (?documento=), privados.
  const params = new URL(request.url).searchParams;
  const foto = params.get('foto');
  const documento = params.get('documento');
  const ruta = foto ?? documento;
  if (ruta) {
    const valida = foto ? /^reclamos\/[\w./-]+\.jpg$/.test(foto) : /^documentos\/\d+\/[\w.-]+$/.test(ruta);
    if (!valida || ruta.includes('..')) return new Response('Ruta inválida', { status: 400 });
    const res = await get(ruta, { access: 'private' });
    if (!res || res.statusCode !== 200) return new Response('No encontrada', { status: 404 });
    const nombre = params.get('nombre')?.replace(/["\r\n]/g, '') || ruta.split('/').pop();
    return new Response(res.stream, {
      headers: {
        'content-type': res.blob.contentType,
        'cache-control': 'private, max-age=3600',
        'content-disposition': `inline; filename="${encodeURIComponent(nombre ?? 'archivo')}"`,
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const reportes = await leerReportes();
  return Response.json({ generado: new Date().toISOString(), reportes }, { headers: { 'cache-control': 'no-store' } });
}
