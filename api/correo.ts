// Correo del panel (el envío está en api/gestion.ts, tipo 'correo').
//   GET  /api/correo                                     -> { proveedor, sinAsociar } ("simulado" o "microsoft365")
//   GET  /api/correo?bandeja=1                           -> correos sin caso pendientes y los últimos gestionados
//   GET  /api/correo?adjunto=correos/...                 -> un adjunto de un correo sin caso
//   POST /api/correo { accion: 'sincronizar' }           -> lee los correos nuevos del buzón
//   POST /api/correo { accion: 'asociar', mensajeId, numero } -> asocia un correo sin caso al reclamo
//   POST /api/correo { accion: 'descartar', mensajeId }  -> lo marca como no relacionado (no se borra)
//   POST /api/correo { accion: 'simular', id?, texto? }  -> solo en modo simulado: un correo entrante de
//        prueba al caso (con id) o sin número en el asunto (sin id), con un adjunto
// Requiere sesión y permiso de comunicación; la bandeja, además, ver todos los reclamos.
import { get } from '@vercel/blob';
import { permisosDe } from '../shared/roles.js';
import {
  asociarCorreo,
  correoEntranteSimulado,
  descartarCorreo,
  numeroEnAsunto,
  procesarEntrante,
  proveedorCorreo,
  sincronizarBuzon,
} from './_correo.js';
import { asegurarTabla, sql } from './_db.js';
import { auditar, noAutorizado, prohibido, puedeVerCaso, usuarioDeSesion } from './_sesion.js';

const error = (status: number, mensaje: string) => Response.json({ error: mensaje }, { status });

// El panel pide sincronizar al abrirse y cada pocos minutos; con varias personas
// conectadas basta una lectura del buzón por minuto en cada instancia.
const ESPERA_MS = 60_000;
let ultimaSincronizacion = 0;

const nombreProveedor = () => (process.env.CORREO_PROVEEDOR === 'microsoft365' ? 'microsoft365' : 'simulado');

export async function GET(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  const permisos = permisosDe(u.rol);
  const bandeja = permisos.comunicacion && permisos.verTodos;
  const params = new URL(request.url).searchParams;
  await asegurarTabla();

  const adjunto = params.get('adjunto');
  if (adjunto) {
    if (!bandeja) return prohibido();
    if (!/^correos\/[\w./-]+$/.test(adjunto) || adjunto.includes('..')) return error(400, 'Ruta inválida.');
    await auditar(u.id, 'ver_adjunto_correo', null, { ruta: adjunto });
    const res = await get(adjunto, { access: 'private' });
    if (!res || res.statusCode !== 200) return error(404, 'No encontrado.');
    const nombre = params.get('nombre')?.replace(/["\r\n]/g, '') || adjunto.split('/').pop();
    return new Response(res.stream, {
      headers: {
        'content-type': res.blob.contentType,
        'cache-control': 'private, max-age=3600',
        'content-disposition': `inline; filename="${encodeURIComponent(nombre ?? 'adjunto')}"`,
        'x-content-type-options': 'nosniff',
      },
    });
  }

  if (params.get('bandeja')) {
    if (!bandeja) return prohibido();
    const filas = await sql`
      (SELECT c.mensaje_id, c.recibido_en, c.datos, c.reclamo_id, c.descartado_en, c.gestionado_por, c.gestionado_en, r.numero
       FROM correos_recibidos c LEFT JOIN reclamos_terremoto r ON r.id = c.reclamo_id
       WHERE c.reclamo_id IS NULL AND c.descartado_en IS NULL
       ORDER BY c.recibido_en)
      UNION ALL
      (SELECT c.mensaje_id, c.recibido_en, c.datos, c.reclamo_id, c.descartado_en, c.gestionado_por, c.gestionado_en, r.numero
       FROM correos_recibidos c LEFT JOIN reclamos_terremoto r ON r.id = c.reclamo_id
       WHERE c.gestionado_en IS NOT NULL
       ORDER BY c.gestionado_en DESC
       LIMIT 20)`;
    const correos = filas.map((f) => ({
      mensajeId: f.mensaje_id,
      recibidoEn: new Date(f.recibido_en).toISOString(),
      ...f.datos,
      estado: f.descartado_en ? 'descartado' : f.reclamo_id ? 'asociado' : 'pendiente',
      numero: f.numero ?? null,
      gestionadoPor: f.gestionado_por,
      gestionadoEn: f.gestionado_en ? new Date(f.gestionado_en).toISOString() : null,
    }));
    return Response.json({ correos }, { headers: { 'cache-control': 'no-store' } });
  }

  const [cuenta] = bandeja
    ? await sql`SELECT count(*)::int AS n FROM correos_recibidos WHERE reclamo_id IS NULL AND descartado_en IS NULL`
    : [{ n: 0 }];
  return Response.json({ proveedor: nombreProveedor(), sinAsociar: cuenta.n }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  const permisos = permisosDe(u.rol);
  if (!permisos.comunicacion) return prohibido();
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== 'object') return error(400, 'Solicitud inválida.');
  await asegurarTabla();

  if (cuerpo.accion === 'sincronizar') {
    if (Date.now() - ultimaSincronizacion < ESPERA_MS) return Response.json({ omitido: true });
    ultimaSincronizacion = Date.now();
    try {
      return Response.json(await sincronizarBuzon());
    } catch (e) {
      console.error('No se pudo leer el buzón', e);
      return error(502, 'No se pudo leer el buzón de correo.');
    }
  }

  if (cuerpo.accion === 'asociar' || cuerpo.accion === 'descartar') {
    if (!permisos.verTodos) return prohibido();
    const mensajeId = typeof cuerpo.mensajeId === 'string' ? cuerpo.mensajeId : '';
    if (!mensajeId) return error(400, 'Correo inválido.');
    if (cuerpo.accion === 'descartar') {
      if (!(await descartarCorreo(mensajeId, u.nombre))) return error(409, 'Este correo ya fue gestionado por otra persona.');
      await auditar(u.id, 'descartar_correo', null, { mensajeId });
      return Response.json({ ok: true });
    }
    const texto = String(cuerpo.numero ?? '').trim();
    const id = numeroEnAsunto(texto) ?? (/^\d{1,9}$/.test(texto) ? Number(texto) : null);
    if (!id) return error(400, 'Escriba el número del reclamo, por ejemplo TRM-000123.');
    const [caso] = await sql`SELECT id, numero FROM reclamos_terremoto WHERE id = ${id}`;
    if (!caso) return error(404, `No existe el reclamo ${texto}.`);
    let resultado;
    try {
      resultado = await asociarCorreo(mensajeId, id, u.nombre);
    } catch (e) {
      console.error('No se pudo asociar el correo', mensajeId, e);
      return error(502, 'No se pudo copiar los adjuntos. Intente de nuevo.');
    }
    if (!resultado) return error(409, 'Este correo ya fue gestionado por otra persona.');
    await auditar(u.id, 'asociar_correo', id, { mensajeId });
    return Response.json({ ok: true, numero: caso.numero, ...resultado });
  }

  if (cuerpo.accion === 'simular') {
    if (nombreProveedor() !== 'simulado') return error(400, 'Solo disponible en modo simulado.');
    const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.slice(0, 4000) : undefined;
    if (cuerpo.id == null) {
      if (!permisos.verTodos) return prohibido();
      const resultado = await procesarEntrante(correoEntranteSimulado(null, texto), 'simulado');
      await auditar(u.id, 'simular_correo', null);
      return Response.json(resultado, { status: 201 });
    }
    const id = Number(cuerpo.id);
    if (!Number.isInteger(id) || id <= 0) return error(400, 'Caso inválido.');
    const [caso] = await sql`SELECT numero, nombre, correo FROM reclamos_terremoto WHERE id = ${id}`;
    if (!caso) return error(404, 'El caso no existe.');
    if (!(await puedeVerCaso(u, id, permisos.verTodos))) return prohibido();
    const resultado = await procesarEntrante(
      correoEntranteSimulado(caso as { numero: string; nombre: string; correo: string }, texto),
      proveedorCorreo().nombre,
    );
    await auditar(u.id, 'simular_correo', id);
    return Response.json(resultado, { status: 201 });
  }

  return error(400, 'Acción inválida.');
}
