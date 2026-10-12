// Gestión de casos desde el panel. Requiere sesión del panel.
//   GET  /api/gestion?id=123   -> historial del caso (eventos en orden)
//   POST /api/gestion          -> registra una acción:
//     { id, autor, tipo: 'estado', estado, estadoAnterior, motivoCierre?, fechaInspeccion? }
//     { id, autor, tipo: 'analisis', causa, coberturas: [{ id, reclamado, reserva, pagado }], version }
//     { id, autor, tipo: 'documento', pathname, nombre, tipoDocumento, descripcion? }
//     { id, autor, tipo: 'asignacion', asignadoA, asignadoAnterior }
//     { id, autor, tipo: 'nota', texto }
//     { id, autor, tipo: 'comunicacion', canal, resultado, texto?, plantilla? }
//     { id, tipo: 'correo', destinatario: 'asegurado' | 'reportante', asunto, texto, plantilla? }  -> envía el correo
//     { id, tipo: 'correo_leido' }                                                                -> quita el aviso de correo nuevo
// Cada acción agrega un evento a reclamo_eventos (nunca se modifica ni borra) y,
// en la misma sentencia, actualiza el estado actual del caso.
import { head } from '@vercel/blob';
import {
  CANALES,
  CAUSAS,
  COBERTURAS,
  ESTADOS,
  MOTIVOS_DECLINACION,
  PLANTILLAS,
  RESULTADOS_CONTACTO,
  TIPOS_DOCUMENTO,
  type CoberturaAfectada,
} from '../shared/flujo.js';
import { proveedorCorreo } from './_correo.js';
import { asegurarTabla, sql } from './_db.js';
import { ROLES_ASIGNABLES, permisosDe, type Permisos } from '../shared/roles.js';
import { auditar, noAutorizado, prohibido, puedeVerCaso, usuarioDeSesion } from './_sesion.js';

// Permiso necesario para cada tipo de acción.
const PERMISO: Record<string, keyof Permisos> = {
  estado: 'cambiarFase',
  asignacion: 'asignar',
  analisis: 'analisis',
  documento: 'documentos',
  nota: 'notas',
  comunicacion: 'comunicacion',
  correo: 'comunicacion',
  correo_leido: 'comunicacion',
};

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const enLista = (lista: readonly { id: string }[], v: string) => lista.some((x) => x.id === v);
const error = (status: number, mensaje: string) => Response.json({ error: mensaje }, { status });
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return error(400, 'Caso inválido.');
  await asegurarTabla();
  if (!(await puedeVerCaso(u, id, permisosDe(u.rol).verTodos))) return prohibido();
  await auditar(u.id, 'ver_caso', id);
  const eventos = await sql`
    SELECT id, creado_en, autor, tipo, datos
    FROM reclamo_eventos
    WHERE reclamo_id = ${id}
    ORDER BY creado_en, id`;
  return Response.json(
    { eventos: eventos.map((e) => ({ ...e, id: Number(e.id), creado_en: new Date(e.creado_en).toISOString() })) },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  const permisos = permisosDe(u.rol);
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== 'object') return error(400, 'Solicitud inválida.');

  const id = Number(cuerpo.id);
  // El autor es siempre el usuario de la sesión, no lo que envíe el navegador.
  const autor = u.nombre;
  const tipo = texto(cuerpo.tipo, 20);
  if (!Number.isInteger(id) || id <= 0) return error(400, 'Caso inválido.');
  if (!PERMISO[tipo]) return error(400, 'Acción inválida.');
  if (!permisos[PERMISO[tipo]]) return prohibido();

  await asegurarTabla();
  const existe = await sql`SELECT estado, asignado_a FROM reclamos_terremoto WHERE id = ${id}`;
  if (!existe.length) return error(404, 'El caso no existe.');
  if (!(await puedeVerCaso(u, id, permisos.verTodos))) return prohibido();

  let filas: Record<string, unknown>[];

  if (tipo === 'correo_leido') {
    await sql`UPDATE reclamos_terremoto SET correo_nuevo = false WHERE id = ${id}`;
    await auditar(u.id, 'correo_leido', id);
    return Response.json({ ok: true });
  }

  if (tipo === 'estado') {
    const estado = texto(cuerpo.estado, 30);
    const anterior = texto(cuerpo.estadoAnterior, 30);
    const motivoCierre = estado === 'declinado' ? texto(cuerpo.motivoCierre, 30) : '';
    const fechaInspeccion = texto(cuerpo.fechaInspeccion, 10);
    if (!enLista(ESTADOS, estado)) return error(400, 'Estado inválido.');
    // Misma fase solo se acepta para actualizar la fecha de inspección.
    if (estado === anterior && !fechaInspeccion) return error(400, 'El caso ya está en esa fase.');
    if (estado === 'declinado' && !enLista(MOTIVOS_DECLINACION, motivoCierre)) return error(400, 'Indique el motivo de la declinación.');
    if (fechaInspeccion && !RE_FECHA.test(fechaInspeccion)) return error(400, 'La fecha de inspección no es válida.');
    const datos = { de: anterior, a: estado, ...(motivoCierre && { motivoCierre }), ...(fechaInspeccion && { fechaInspeccion }) };
    filas = await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto
        SET estado = ${estado},
            motivo_cierre = ${motivoCierre || null},
            fecha_inspeccion = coalesce(${fechaInspeccion || null}::date, fecha_inspeccion),
            fase_desde = CASE WHEN estado = ${estado} THEN fase_desde ELSE now() END,
            actualizado_en = now()
        WHERE id = ${id} AND estado = ${anterior}
        RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, ${autor}, 'estado', ${JSON.stringify(datos)}::jsonb FROM cambio
      RETURNING id`;
  } else if (tipo === 'asignacion') {
    const nuevoId = cuerpo.asignadoUsuarioId == null ? null : Number(cuerpo.asignadoUsuarioId);
    const anteriorId = cuerpo.asignadoAnterior == null ? null : Number(cuerpo.asignadoAnterior);
    if (nuevoId === anteriorId) return error(400, 'El caso ya está asignado a esa persona.');
    let nombre: string | null = null;
    if (nuevoId !== null) {
      const [destino] = await sql`SELECT nombre, rol FROM usuarios WHERE id = ${nuevoId} AND activo`;
      if (!destino || !(ROLES_ASIGNABLES as string[]).includes(destino.rol)) return error(400, 'Ese usuario no puede recibir casos.');
      nombre = destino.nombre;
    }
    const datos = { de: existe[0].asignado_a ?? null, a: nombre, aUsuarioId: nuevoId };
    filas = await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto
        SET asignado_a = ${nombre}, asignado_usuario_id = ${nuevoId}, actualizado_en = now()
        WHERE id = ${id} AND coalesce(asignado_usuario_id, 0) = ${anteriorId ?? 0}
        RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, ${autor}, 'asignacion', ${JSON.stringify(datos)}::jsonb FROM cambio
      RETURNING id`;
  } else if (tipo === 'analisis') {
    const causa = texto(cuerpo.causa, 30);
    const version = Number(cuerpo.version);
    if (causa && !enLista(CAUSAS, causa)) return error(400, 'Causa inválida.');
    if (!Number.isInteger(version) || version < 0) return error(400, 'Versión inválida.');
    if (!Array.isArray(cuerpo.coberturas) || cuerpo.coberturas.length > COBERTURAS.length) return error(400, 'Coberturas inválidas.');
    const monto = (v: unknown) => {
      const n = Math.round(Number(v ?? 0) * 100) / 100;
      return Number.isFinite(n) && n >= 0 && n <= 1e10 ? n : NaN;
    };
    const coberturas: CoberturaAfectada[] = cuerpo.coberturas.map((c: Record<string, unknown>) => ({
      id: texto(c?.id, 30),
      reclamado: monto(c?.reclamado),
      reserva: monto(c?.reserva),
      pagado: monto(c?.pagado),
    }));
    const ids = coberturas.map((c) => c.id);
    if (coberturas.some((c) => !enLista(COBERTURAS, c.id) || [c.reclamado, c.reserva, c.pagado].some(Number.isNaN)) || new Set(ids).size !== ids.length)
      return error(400, 'Revise las coberturas y los montos.');
    const datos = { causa: causa || null, coberturas };
    filas = await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto
        SET causa = ${causa || null}, coberturas = ${JSON.stringify(coberturas)}::jsonb,
            analisis_version = analisis_version + 1, actualizado_en = now()
        WHERE id = ${id} AND analisis_version = ${version}
        RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, ${autor}, 'analisis', ${JSON.stringify(datos)}::jsonb FROM cambio
      RETURNING id`;
  } else if (tipo === 'documento') {
    const pathname = texto(cuerpo.pathname, 300);
    const nombre = texto(cuerpo.nombre, 200);
    const tipoDocumento = texto(cuerpo.tipoDocumento, 30);
    if (!pathname.startsWith(`documentos/${id}/`) || pathname.includes('..')) return error(400, 'Documento inválido.');
    if (!nombre || !enLista(TIPOS_DOCUMENTO, tipoDocumento)) return error(400, 'Indique el tipo de documento.');
    let archivo;
    try {
      archivo = await head(pathname);
    } catch {
      return error(400, 'No se encontró el archivo subido. Intente subirlo de nuevo.');
    }
    const datos = {
      pathname,
      nombre,
      tipoDocumento,
      descripcion: texto(cuerpo.descripcion, 300),
      tamano: archivo.size,
      contentType: archivo.contentType,
    };
    filas = await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto SET actualizado_en = now() WHERE id = ${id} RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, ${autor}, 'documento', ${JSON.stringify(datos)}::jsonb FROM cambio
      RETURNING id`;
  } else if (tipo === 'correo') {
    // La dirección sale siempre del caso, no del navegador.
    const [caso] = await sql`
      SELECT numero, nombre, correo, reportado_por, reportante_nombre, reportante_correo FROM reclamos_terremoto WHERE id = ${id}`;
    const aReportante = cuerpo.destinatario === 'reportante';
    const nombre: string = (aReportante ? caso.reportante_nombre : caso.nombre) ?? '';
    const para = ((aReportante ? caso.reportante_correo : caso.correo) ?? '').trim();
    if (aReportante && caso.reportado_por === 'asegurado') return error(400, 'Este reclamo lo reportó el asegurado.');
    if (!RE_CORREO.test(para)) return error(400, 'Este contacto no tiene un correo válido.');
    const plantilla = texto(cuerpo.plantilla, 30);
    if (plantilla && !enLista(PLANTILLAS, plantilla)) return error(400, 'Plantilla inválida.');
    const mensaje = texto(cuerpo.texto, 8000);
    let asunto = texto(cuerpo.asunto, 200).replace(/[\r\n]+/g, ' ');
    if (!asunto || !mensaje) return error(400, 'Escriba el asunto y el mensaje.');
    // El número del reclamo en el asunto permite asociar la respuesta al caso.
    if (!asunto.includes(caso.numero)) asunto = `${asunto} · ${caso.numero}`;
    let proveedor;
    try {
      proveedor = proveedorCorreo();
      await proveedor.enviar({ para, nombre, asunto, texto: mensaje });
    } catch (e) {
      console.error('No se pudo enviar el correo', id, e);
      return error(502, 'No se pudo enviar el correo. Intente de nuevo en unos minutos o use "Abrir correo".');
    }
    const datos = {
      canal: 'correo',
      resultado: 'mensaje_enviado',
      direccion: 'saliente',
      envio: proveedor.nombre,
      para,
      asunto,
      texto: mensaje,
      ...(plantilla && { plantilla }),
      ...(aReportante && { destinatario: nombre }),
    };
    filas = await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto SET correo_nuevo = false, actualizado_en = now() WHERE id = ${id} RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, ${autor}, 'comunicacion', ${JSON.stringify(datos)}::jsonb FROM cambio
      RETURNING id`;
  } else if (tipo === 'nota' || tipo === 'comunicacion') {
    let datos: Record<string, string>;
    if (tipo === 'nota') {
      const nota = texto(cuerpo.texto, 2000);
      if (!nota) return error(400, 'Escriba la nota.');
      datos = { texto: nota };
    } else {
      const canal = texto(cuerpo.canal, 20);
      const resultado = texto(cuerpo.resultado, 30);
      const plantilla = texto(cuerpo.plantilla, 30);
      if (!enLista(CANALES, canal)) return error(400, 'Indique el canal.');
      if (!enLista(RESULTADOS_CONTACTO, resultado)) return error(400, 'Indique el resultado del contacto.');
      if (plantilla && !enLista(PLANTILLAS, plantilla)) return error(400, 'Plantilla inválida.');
      const destinatario = texto(cuerpo.destinatario, 120);
      datos = { canal, resultado, texto: texto(cuerpo.texto, 4000), ...(plantilla && { plantilla }), ...(destinatario && { destinatario }) };
    }
    filas = await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto SET actualizado_en = now() WHERE id = ${id} RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, ${autor}, ${tipo}, ${JSON.stringify(datos)}::jsonb FROM cambio
      RETURNING id`;
  } else {
    return error(400, 'Acción inválida.');
  }

  if (!filas.length) {
    return error(409, 'Otra persona actualizó este caso hace un momento. Revise el estado actual e intente de nuevo.');
  }
  return Response.json({ ok: true }, { status: 201 });
}
