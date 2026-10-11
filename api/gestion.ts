// Gestión de casos desde el panel. Requiere sesión del panel.
//   GET  /api/gestion?id=123   -> historial del caso (eventos en orden)
//   POST /api/gestion          -> registra una acción:
//     { id, autor, tipo: 'estado', estado, estadoAnterior, motivoCierre?, fechaInspeccion? }
//     { id, autor, tipo: 'asignacion', asignadoA, asignadoAnterior }
//     { id, autor, tipo: 'nota', texto }
//     { id, autor, tipo: 'comunicacion', canal, resultado, texto?, plantilla? }
// Cada acción agrega un evento a reclamo_eventos (nunca se modifica ni borra) y,
// en la misma sentencia, actualiza el estado actual del caso.
import { CANALES, ESTADOS, MOTIVOS_CIERRE, PLANTILLAS, RESULTADOS_CONTACTO } from '../shared/flujo.js';
import { asegurarTabla, sql } from './_db.js';
import { noAutorizado, sesionValida } from './_sesion.js';

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const enLista = (lista: readonly { id: string }[], v: string) => lista.some((x) => x.id === v);
const error = (status: number, mensaje: string) => Response.json({ error: mensaje }, { status });
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  if (!sesionValida(request)) return noAutorizado();
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return error(400, 'Caso inválido.');
  await asegurarTabla();
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
  if (!sesionValida(request)) return noAutorizado();
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== 'object') return error(400, 'Solicitud inválida.');

  const id = Number(cuerpo.id);
  const autor = texto(cuerpo.autor, 60);
  const tipo = texto(cuerpo.tipo, 20);
  if (!Number.isInteger(id) || id <= 0) return error(400, 'Caso inválido.');
  if (autor.length < 2) return error(400, 'Indique su nombre.');

  await asegurarTabla();
  const existe = await sql`SELECT estado, asignado_a FROM reclamos_terremoto WHERE id = ${id}`;
  if (!existe.length) return error(404, 'El caso no existe.');

  let filas: Record<string, unknown>[];

  if (tipo === 'estado') {
    const estado = texto(cuerpo.estado, 30);
    const anterior = texto(cuerpo.estadoAnterior, 30);
    const motivoCierre = estado === 'cerrado' ? texto(cuerpo.motivoCierre, 30) : '';
    const fechaInspeccion = texto(cuerpo.fechaInspeccion, 10);
    if (!enLista(ESTADOS, estado)) return error(400, 'Estado inválido.');
    if (estado === anterior) return error(400, 'El caso ya está en ese estado.');
    if (estado === 'cerrado' && !enLista(MOTIVOS_CIERRE, motivoCierre)) return error(400, 'Indique el motivo de cierre.');
    if (estado === 'inspeccion_programada' && !RE_FECHA.test(fechaInspeccion)) return error(400, 'Indique la fecha de inspección.');
    const datos = { de: anterior, a: estado, ...(motivoCierre && { motivoCierre }), ...(fechaInspeccion && { fechaInspeccion }) };
    filas = await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto
        SET estado = ${estado},
            motivo_cierre = ${motivoCierre || null},
            fecha_inspeccion = coalesce(${fechaInspeccion || null}::date, fecha_inspeccion),
            actualizado_en = now()
        WHERE id = ${id} AND estado = ${anterior}
        RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, ${autor}, 'estado', ${JSON.stringify(datos)}::jsonb FROM cambio
      RETURNING id`;
  } else if (tipo === 'asignacion') {
    const asignadoA = texto(cuerpo.asignadoA, 60);
    const anterior = texto(cuerpo.asignadoAnterior, 60);
    if (asignadoA === anterior) return error(400, 'El caso ya está asignado a esa persona.');
    const datos = { de: anterior || null, a: asignadoA || null };
    filas = await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto
        SET asignado_a = ${asignadoA || null}, actualizado_en = now()
        WHERE id = ${id} AND coalesce(asignado_a, '') = ${anterior}
        RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, ${autor}, 'asignacion', ${JSON.stringify(datos)}::jsonb FROM cambio
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
      datos = { canal, resultado, texto: texto(cuerpo.texto, 4000), ...(plantilla && { plantilla }) };
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
