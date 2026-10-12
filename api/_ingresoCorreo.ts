// Ingreso automático de reportes por correo. Un correo sin número de reclamo que
// reporta daños se lee (api/_extractor.ts), se completa con el sistema de pólizas y
// se valida con las mismas reglas del formulario:
//   - Completo: se crea el reclamo (canal "correo"), el correo y sus adjuntos pasan al
//     caso y se responde con el número TRM.
//   - Incompleto: queda como "reporte por correo" B-000123 y se responde pidiendo
//     exactamente lo que falta. Cuando el remitente contesta (con [B-000123] en el
//     asunto), se vuelve a leer todo el hilo y se repite.
// Lo que no parece un reporte queda en la bandeja de correos sin caso, como antes.
// Nada se borra: los correos quedan en correos_recibidos y los borradores en
// reportes_correo.
import { createHash } from 'node:crypto';
import { copy } from '@vercel/blob';
import { MAX_FOTOS, calcularPrioridad } from '../shared/catalogos.js';
import { asociarCorreo, proveedorCorreo, type DatosCorreo } from './_correo.js';
import { asegurarTabla, conReintentos, guardarReclamo, sql } from './_db.js';
import { combinar, proveedorExtraccion, type MensajeCorreo, type Propuesta } from './_extractor.js';
import { normalizarPoliza, proveedorPolizas } from './_polizas.js';
import { faltantes, normalizarDatos, prepararDatos, type Datos } from './_validacion.js';

export const AUTOR_AUTOMATICO = 'Ingreso automático por correo';
// Respuestas automáticas por borrador: después de esto, lo atiende una persona.
export const MAX_RESPUESTAS = 3;

export type ResultadoIngreso =
  | { estado: 'creado'; reclamoId: number; numero: string; borrador: string }
  | { estado: 'incompleto'; borrador: string; faltan: string[] }
  | { estado: 'no_es_reporte' };

// Número del borrador en el asunto: "[B-000123]".
export function borradorEnAsunto(asunto: string): number | null {
  const m = /\bB-0*(\d{1,9})\b/i.exec(asunto);
  return m ? Number(m[1]) : null;
}

// Remitentes a los que nunca se responde solos (evita bucles con respuestas automáticas).
function esAutomatico(de: string, asunto: string) {
  const buzon = (process.env.M365_BUZON ?? '').toLowerCase();
  return (
    /no-?reply|mailer-daemon|postmaster|notificacion(es)?@/i.test(de) ||
    (!!buzon && de.toLowerCase() === buzon) ||
    /^(respuesta autom[aá]tica|automatic reply|fuera de la oficina|out of office|undeliverable|no se puede entregar)/i.test(asunto)
  );
}

// Propuesta del extractor + póliza + remitente -> datos del formulario.
async function componer(p: Propuesta, remitente: { de: string; deNombre: string }) {
  const crudo: Record<string, unknown> = { ...p };
  let polizaNoEncontrada = false;
  let poliza = null;
  if (p.poliza) {
    try {
      poliza = await proveedorPolizas().buscar(normalizarPoliza(p.poliza));
      polizaNoEncontrada = !poliza;
    } catch (e) {
      // Si el sistema de pólizas no responde, se sigue con lo que dijo el correo.
      console.warn('No se pudo consultar la póliza para el ingreso por correo', e);
    }
  }
  const esCorredorDeLaPoliza = !!poliza?.corredor?.correo && poliza.corredor.correo.toLowerCase() === remitente.de.toLowerCase();
  crudo.reportadoPor = esCorredorDeLaPoliza ? 'corredor' : p.reportadoPor || 'asegurado';
  if (crudo.reportadoPor === 'asegurado') {
    crudo.correo = p.correo || remitente.de;
    crudo.nombre = p.nombre || poliza?.asegurado.nombre || remitente.deNombre;
  } else {
    crudo.reportanteCorreo = remitente.de;
    crudo.reportanteNombre = p.reportanteNombre || (esCorredorDeLaPoliza ? poliza!.corredor!.nombre : remitente.deNombre);
    crudo.reportanteCodigo = p.reportanteCodigo || (esCorredorDeLaPoliza ? poliza!.corredor!.codigo : '');
    crudo.nombre = p.nombre || poliza?.asegurado.nombre || '';
    crudo.correo = p.correo || poliza?.asegurado.correo || '';
  }
  crudo.telefono = p.telefono || poliza?.asegurado.telefono || '';
  const datos = normalizarDatos(crudo);
  const faltan = faltantes(datos);
  if (polizaNoEncontrada) faltan.unshift(`Revise el número de póliza: no encontramos la póliza ${datos.poliza}`);
  return { datos, faltan };
}

const refDe = (borradorId: number) => {
  const h = createHash('sha256').update(`reporte-correo-${borradorId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function textoPedido(nombre: string, borrador: string, faltan: string[]) {
  return [
    `Hola${nombre ? `, ${nombre.split(/\s+/)[0]}` : ''}. Gracias por escribirnos.`,
    '',
    `Para registrar su reporte de daños necesitamos lo siguiente:`,
    ...faltan.map((f) => `- ${f}`),
    '',
    `Por favor responda a este mismo correo con esos datos (sin cambiar el asunto, que lleva la referencia ${borrador}). En cuanto los tengamos, registramos el reporte y le enviamos su número.`,
    '',
    'Si lo prefiere, también puede reportar en assa-terremoto.vercel.app.',
    '',
    'ASSA Compañía de Seguros · Reclamos por sismo',
  ].join('\n');
}

function textoConfirmacion(nombre: string, numero: string, d: Datos) {
  return [
    `Hola${nombre ? `, ${nombre.split(/\s+/)[0]}` : ''}. Registramos su reporte ${numero} por daños en el inmueble de ${d.distrito}, ${d.provincia} (póliza ${d.poliza}).`,
    '',
    `Puede consultar en qué fase está en assa-terremoto.vercel.app/consulta con el número ${numero} y su póliza. Si necesita enviarnos más información o fotos, responda a este correo sin cambiar el asunto.`,
    '',
    'ASSA Compañía de Seguros · Reclamos por sismo',
  ].join('\n');
}

async function responder(para: string, nombre: string, asunto: string, texto: string) {
  try {
    await proveedorCorreo().enviar({ para, nombre, asunto, texto });
    return true;
  } catch (e) {
    console.error('No se pudo enviar la respuesta automática', para, e);
    return false;
  }
}

// Procesa un correo ya guardado en correos_recibidos sin caso. No lanza errores
// por el extractor: si falla, el correo queda en la bandeja para una persona.
export async function ingresarPorCorreo(mensajeId: string): Promise<ResultadoIngreso> {
  await asegurarTabla();
  // Correo de un hilo cuyo reclamo ya se creó pero que no se alcanzó a asociar: se asocia ahora.
  const [resto] = await sql`
    SELECT b.numero AS borrador, r.id, r.numero FROM correos_recibidos c
    JOIN reportes_correo b ON b.id = c.reporte_correo_id AND b.estado = 'creado'
    JOIN reclamos_terremoto r ON r.id = b.reclamo_id
    WHERE c.mensaje_id = ${mensajeId} AND c.reclamo_id IS NULL AND c.descartado_en IS NULL`;
  if (resto) {
    await asociarCorreo(mensajeId, resto.id, AUTOR_AUTOMATICO);
    return { estado: 'creado', reclamoId: resto.id, numero: resto.numero, borrador: resto.borrador };
  }
  const [fila] = await sql`
    SELECT mensaje_id, recibido_en, datos FROM correos_recibidos
    WHERE mensaje_id = ${mensajeId} AND reclamo_id IS NULL AND descartado_en IS NULL AND reporte_correo_id IS NULL`;
  if (!fila) return { estado: 'no_es_reporte' };
  const correo = fila.datos as DatosCorreo;
  if (esAutomatico(correo.de, correo.asunto)) return { estado: 'no_es_reporte' };

  // ¿Responde a un reporte incompleto? Solo si viene del mismo remitente.
  const idBorrador = borradorEnAsunto(correo.asunto);
  const [borrador] = idBorrador
    ? await sql`
        SELECT id, numero, propuesta, mensajes, respuestas FROM reportes_correo
        WHERE id = ${idBorrador} AND estado = 'pendiente' AND lower(remitente) = ${correo.de.toLowerCase()}`
    : [];

  const mensajes: string[] = [...(borrador?.mensajes ?? []), mensajeId];
  const filas = await sql`SELECT mensaje_id, recibido_en, datos FROM correos_recibidos WHERE mensaje_id = ANY(${mensajes})`;
  const hilo: MensajeCorreo[] = mensajes
    .map((id) => filas.find((f) => f.mensaje_id === id))
    .filter((f) => !!f)
    .map((f) => ({
      de: f.datos.de,
      deNombre: f.datos.deNombre,
      asunto: f.datos.asunto,
      texto: f.datos.texto,
      recibidoEn: new Date(f.recibido_en).toISOString(),
      adjuntos: (f.datos.adjuntos ?? []).map((a: { nombre: string }) => a.nombre),
    }));

  const extractor = proveedorExtraccion();
  let propuesta: Propuesta;
  try {
    const nueva = await extractor.extraer(hilo);
    propuesta = borrador ? combinar(borrador.propuesta as Propuesta, nueva) : nueva;
  } catch (e) {
    console.error('No se pudo leer el correo para el ingreso automático', mensajeId, e);
    return { estado: 'no_es_reporte' };
  }
  if (!borrador && !propuesta.esReporteDeDanos) return { estado: 'no_es_reporte' };

  const { datos, faltan } = await componer(propuesta, { de: correo.de, deNombre: correo.deNombre });

  // Guarda (o actualiza) el borrador y vincula el correo, en una sola sentencia.
  const [b] = borrador
    ? await sql`
        WITH b AS (
          UPDATE reportes_correo
          SET propuesta = ${JSON.stringify(propuesta)}::jsonb, datos = ${JSON.stringify(datos)}::jsonb, faltantes = ${faltan},
              mensajes = ${mensajes}, actualizado_en = now()
          WHERE id = ${borrador.id}
          RETURNING id, numero, respuestas
        ), c AS (
          UPDATE correos_recibidos SET reporte_correo_id = (SELECT id FROM b) WHERE mensaje_id = ${mensajeId}
        )
        SELECT * FROM b`
    : await sql`
        WITH b AS (
          INSERT INTO reportes_correo (remitente, remitente_nombre, propuesta, datos, faltantes, mensajes, extractor)
          VALUES (${correo.de}, ${correo.deNombre}, ${JSON.stringify(propuesta)}::jsonb, ${JSON.stringify(datos)}::jsonb, ${faltan},
                  ${mensajes}, ${extractor.nombre})
          RETURNING id, numero, respuestas
        ), c AS (
          UPDATE correos_recibidos SET reporte_correo_id = (SELECT id FROM b) WHERE mensaje_id = ${mensajeId}
        )
        SELECT * FROM b`;

  const nombreContacto = datos.reportadoPor === 'asegurado' ? datos.nombre : datos.reportanteNombre;

  if (faltan.length) {
    if (b.respuestas < MAX_RESPUESTAS) {
      const enviado = await responder(
        correo.de,
        nombreContacto,
        `ASSA · Información pendiente para registrar su reporte [${b.numero}]`,
        textoPedido(nombreContacto, b.numero, faltan),
      );
      if (enviado) await sql`UPDATE reportes_correo SET respuestas = respuestas + 1 WHERE id = ${b.id}`;
    }
    return { estado: 'incompleto', borrador: b.numero, faltan };
  }

  // Completo: se crea el reclamo. La ref sale del borrador: si algo falla y se
  // reintenta, no se duplica.
  const listo = prepararDatos(datos);
  const { sitioWeb: _, ...campos } = listo;
  const recibidoEn = hilo[0]?.recibidoEn ?? new Date().toISOString();
  const ref = refDe(b.id);
  // Las fotos adjuntas pasan a ser las fotos del reporte, como las del formulario.
  const imagenes = filas
    .flatMap((f) => (f.datos.adjuntos ?? []) as { pathname: string; contentType: string }[])
    .filter((a) => /^image\/(jpeg|png|webp)$/.test(a.contentType))
    .slice(0, MAX_FOTOS);
  const fotos: string[] = [];
  for (const [i, a] of imagenes.entries()) {
    const destino = `reclamos/${recibidoEn.slice(0, 10)}/${ref}/foto-${i + 1}.${a.contentType === 'image/jpeg' ? 'jpg' : a.contentType.slice(6)}`;
    // Ruta fija y sobrescribible: si se reintenta, no se duplican.
    const blob = await conReintentos(() => copy(a.pathname, destino, { access: 'private', contentType: a.contentType, addRandomSuffix: false, allowOverwrite: true }));
    fotos.push(blob.pathname);
  }
  const numero = await guardarReclamo({
    ...campos,
    ref,
    recibidoEn,
    prioridad: calcularPrioridad(listo),
    fotos,
    canalIngreso: 'correo',
  });
  const [caso] = await sql`SELECT id FROM reclamos_terremoto WHERE numero = ${numero}`;
  await sql`
    UPDATE reportes_correo SET estado = 'creado', reclamo_id = ${caso.id}, actualizado_en = now()
    WHERE id = ${b.id} AND estado = 'pendiente'`;
  // Los correos del hilo y sus adjuntos pasan al caso. Si alguno falla, queda en la
  // bandeja ("por asociar") para que una persona lo asocie.
  for (const id of mensajes) {
    await asociarCorreo(id, caso.id, AUTOR_AUTOMATICO).catch((e) => console.error('No se pudo asociar el correo al reclamo creado', id, e));
  }

  const asunto = `ASSA · Recibimos su reporte ${numero}`;
  const texto = textoConfirmacion(nombreContacto, numero, listo);
  if (await responder(correo.de, nombreContacto, asunto, texto)) {
    const evento = {
      canal: 'correo',
      resultado: 'mensaje_enviado',
      direccion: 'saliente',
      envio: proveedorCorreo().nombre,
      para: correo.de,
      asunto,
      texto,
      plantilla: 'recepcion',
      automatico: true,
    };
    await sql`
      WITH cambio AS (UPDATE reclamos_terremoto SET correo_nuevo = false WHERE id = ${caso.id} RETURNING id)
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, ${AUTOR_AUTOMATICO}, 'comunicacion', ${JSON.stringify(evento)}::jsonb FROM cambio`;
  }
  console.log('Reclamo creado por correo', numero, b.numero);
  return { estado: 'creado', reclamoId: caso.id, numero, borrador: b.numero };
}

// Un supervisor o analista descarta un reporte por correo incompleto (no se borra).
export async function descartarBorrador(id: number, usuario: string) {
  const filas = await sql`
    UPDATE reportes_correo SET estado = 'descartado', gestionado_por = ${usuario}, actualizado_en = now()
    WHERE id = ${id} AND estado = 'pendiente' RETURNING id`;
  return filas.length > 0;
}
