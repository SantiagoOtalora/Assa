// Conector de correo. El resto del sistema solo usa `proveedorCorreo()` y
// `procesarEntrante()`; el proveedor se elige con la variable CORREO_PROVEEDOR:
//   - "simulado" (por defecto): no envía nada; los correos quedan en el historial
//     como "enviado (simulado)" y los entrantes se simulan desde el panel.
//   - "microsoft365": buzón compartido de ASSA vía Microsoft Graph, con una app
//     registrada en Azure (permisos de aplicación Mail.Send y Mail.ReadWrite).
//     Variables: M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET, M365_BUZON.
// Los correos entrantes con un número TRM-000123 en el asunto se asocian al caso
// y sus adjuntos quedan como documentos. Todo correo leído del buzón se guarda en
// correos_recibidos (también los que no se pudieron asociar).
import { copy, put } from '@vercel/blob';
import { MAX_BYTES_DOCUMENTO } from '../shared/flujo.js';
import { asegurarTabla, conReintentos, sql } from './_db.js';
import { ingresarPorCorreo } from './_ingresoCorreo.js';

export type CorreoSaliente = { para: string; nombre: string; asunto: string; texto: string };

export type AdjuntoEntrante = { nombre: string; tipo: string; contenido: Uint8Array };

export type CorreoEntrante = {
  mensajeId: string; // id único del mensaje en el buzón
  de: string;
  deNombre: string;
  asunto: string;
  texto: string;
  recibidoEn: string; // ISO
  adjuntos: AdjuntoEntrante[];
};

export type NombreProveedorCorreo = 'simulado' | 'microsoft365';

export interface ProveedorCorreo {
  nombre: NombreProveedorCorreo;
  enviar(correo: CorreoSaliente): Promise<{ mensajeId: string | null }>;
  // Correos no leídos del buzón, del más antiguo al más reciente.
  recibir(maximo: number): Promise<CorreoEntrante[]>;
  // Se llama después de guardar el correo, para no volver a leerlo.
  marcarLeido(mensajeId: string): Promise<void>;
}

export function proveedorCorreo(): ProveedorCorreo {
  return process.env.CORREO_PROVEEDOR === 'microsoft365' ? proveedorMicrosoft365() : proveedorSimulado;
}

// Número del reclamo en el asunto: "TRM-000123", "trm 123", "RE: ... TRM-000123".
export function numeroEnAsunto(asunto: string): number | null {
  const m = /\bTRM[\s-]?0*(\d{1,9})\b/i.exec(asunto);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Proveedor simulado

const proveedorSimulado: ProveedorCorreo = {
  nombre: 'simulado',
  async enviar() {
    return { mensajeId: `simulado-${crypto.randomUUID()}` };
  },
  async recibir() {
    // En modo simulado los correos entrantes se crean con "Simular correo entrante".
    return [];
  },
  async marcarLeido() {},
};

// Correo entrante de prueba: respuesta del destinatario a un caso, con un PDF adjunto.
// Sin caso: un correo sin número en el asunto, para probar la bandeja de correos sin asociar.
export function correoEntranteSimulado(caso: { numero: string; nombre: string; correo: string } | null, texto?: string): CorreoEntrante {
  if (!caso) {
    const base = correoEntranteSimulado({ numero: 'de mi casa', nombre: 'Carlos Ríos', correo: 'carlos.rios@ejemplo.com' }, texto);
    return {
      ...base,
      asunto: 'Consulta sobre mi reclamo por el sismo',
      texto:
        texto?.trim() ||
        'Buenas tardes. Reporté daños en mi apartamento la semana pasada pero no tengo el número. Mi póliza es la 02-B-123. Adjunto el presupuesto. Carlos Ríos',
    };
  }
  const pdf =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj ' +
    `4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 72 720 Td (Presupuesto simulado ${caso.numero}) Tj ET\nendstream endobj ` +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
  return {
    mensajeId: `simulado-entrante-${crypto.randomUUID()}`,
    de: caso.correo || 'asegurado@ejemplo.com',
    deNombre: caso.nombre,
    asunto: `RE: ASSA · Información pendiente de su reporte ${caso.numero}`,
    texto:
      texto?.trim() ||
      `Buenos días. Adjunto el presupuesto de reparación que me pidieron para el reporte ${caso.numero}. Quedo atento. ${caso.nombre}`,
    recibidoEn: new Date().toISOString(),
    adjuntos: [{ nombre: 'presupuesto-simulado.pdf', tipo: 'application/pdf', contenido: new TextEncoder().encode(pdf) }],
  };
}

// Reportes de ejemplo por correo, para probar el ingreso automático en modo simulado:
// uno completo (crea el reclamo solo) y uno incompleto (pide lo que falta).
export function reporteSimulado(tipo: 'completo' | 'incompleto'): CorreoEntrante {
  const completo = tipo === 'completo';
  return {
    mensajeId: `simulado-reporte-${crypto.randomUUID()}`,
    de: completo ? 'maria.gonzalez@ejemplo.com' : 'jose.rodriguez@ejemplo.com',
    deNombre: completo ? 'María González' : 'José Rodríguez',
    asunto: completo ? 'Daños en mi casa por el sismo' : 'Reporte de daños por el terremoto',
    texto: completo
      ? 'Buenos días. Mi nombre es María González, mi póliza es la 02-B-555. Con el sismo de ayer se abrieron grietas grandes ' +
        'en varias paredes de la casa y se cayó parte del cielo raso de la sala. Podemos seguir viviendo ahí. La casa queda en ' +
        'David, Chiriquí. Dirección: Barriada San Mateo, calle 3, casa 45. Mi celular es 6612-3456. Autorizo el uso de mis datos ' +
        'para el reclamo. Gracias.'
      : 'Buenas tardes. Con el terremoto se rompieron los vidrios de las ventanas y hay grietas en las paredes de mi apartamento. ' +
        'Mi póliza es la 03-H-777. ¿Qué debo hacer? José',
    recibidoEn: new Date().toISOString(),
    adjuntos: [],
  };
}

// La respuesta del remitente a un pedido de información, con lo que suele faltar.
export function respuestaSimulada(borrador: { numero: string; remitente: string; remitente_nombre: string | null }): CorreoEntrante {
  return {
    mensajeId: `simulado-respuesta-${crypto.randomUUID()}`,
    de: borrador.remitente,
    deNombre: borrador.remitente_nombre ?? '',
    asunto: `RE: ASSA · Información pendiente para registrar su reporte [${borrador.numero}]`,
    texto:
      'Hola. El apartamento queda en San Miguelito, Panamá. Dirección: PH Vista Linda, piso 8, apto 8B. Mi nombre es José ' +
      'Rodríguez, celular 6698-7654. Los daños fueron el 10/10/2026, solo en la sala. Podemos seguir viviendo. Autorizo el uso ' +
      'de mis datos.\n\n> El equipo de ASSA escribió: ...',
    recibidoEn: new Date().toISOString(),
    adjuntos: [],
  };
}

// ---------------------------------------------------------------------------
// Proveedor Microsoft 365 (Microsoft Graph, flujo de credenciales de cliente)

const GRAPH = 'https://graph.microsoft.com/v1.0';

function proveedorMicrosoft365(): ProveedorCorreo {
  const { M365_TENANT_ID: tenant, M365_CLIENT_ID: cliente, M365_CLIENT_SECRET: secreto, M365_BUZON: buzon } = process.env;
  if (!tenant || !cliente || !secreto || !buzon) {
    throw new Error('Faltan M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET o M365_BUZON');
  }
  let token: { valor: string; vence: number } | null = null;

  async function obtenerToken() {
    if (token && token.vence > Date.now() + 60_000) return token.valor;
    const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant!)}/oauth2/v2.0/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cliente!,
        client_secret: secreto!,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });
    if (!res.ok) throw new Error(`Microsoft 365 rechazó las credenciales (${res.status})`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    token = { valor: json.access_token, vence: Date.now() + json.expires_in * 1000 };
    return token.valor;
  }

  async function graph(ruta: string, init: RequestInit = {}) {
    const res = await fetch(`${GRAPH}/users/${encodeURIComponent(buzon!)}${ruta}`, {
      ...init,
      headers: { authorization: `Bearer ${await obtenerToken()}`, 'content-type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`Microsoft Graph respondió ${res.status} en ${ruta.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
    return res;
  }

  type Mensaje = {
    id: string;
    subject: string | null;
    receivedDateTime: string;
    from?: { emailAddress: { address: string; name: string } };
    body: { content: string };
    hasAttachments: boolean;
  };
  type Adjunto = { '@odata.type': string; name: string; contentType: string; size: number; isInline: boolean; contentBytes?: string };

  return {
    nombre: 'microsoft365',
    async enviar(c) {
      await graph('/sendMail', {
        method: 'POST',
        body: JSON.stringify({
          message: {
            subject: c.asunto,
            body: { contentType: 'Text', content: c.texto },
            toRecipients: [{ emailAddress: { address: c.para, name: c.nombre } }],
          },
          saveToSentItems: true,
        }),
      });
      // sendMail no devuelve el id del mensaje.
      return { mensajeId: null };
    },
    async recibir(maximo) {
      const filtro = encodeURIComponent('isRead eq false');
      const campos = 'id,subject,receivedDateTime,from,body,hasAttachments';
      const res = await graph(`/mailFolders/inbox/messages?$filter=${filtro}&$orderby=receivedDateTime&$top=${maximo}&$select=${campos}`, {
        headers: { prefer: 'outlook.body-content-type="text"' },
      });
      const mensajes = ((await res.json()) as { value: Mensaje[] }).value;
      const correos: CorreoEntrante[] = [];
      for (const m of mensajes) {
        const adjuntos: AdjuntoEntrante[] = [];
        if (m.hasAttachments) {
          const ra = await graph(`/messages/${encodeURIComponent(m.id)}/attachments`);
          for (const a of ((await ra.json()) as { value: Adjunto[] }).value) {
            // Solo archivos (no correos o elementos de calendario adjuntos) que no sean imágenes de la firma.
            if (a['@odata.type'] !== '#microsoft.graph.fileAttachment' || a.isInline || !a.contentBytes) continue;
            adjuntos.push({ nombre: a.name, tipo: a.contentType || 'application/octet-stream', contenido: Buffer.from(a.contentBytes, 'base64') });
          }
        }
        correos.push({
          mensajeId: m.id,
          de: m.from?.emailAddress.address ?? '',
          deNombre: m.from?.emailAddress.name ?? '',
          asunto: m.subject ?? '',
          texto: m.body.content,
          recibidoEn: m.receivedDateTime,
          adjuntos,
        });
      }
      return correos;
    },
    async marcarLeido(id) {
      await graph(`/messages/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ isRead: true }) });
    },
  };
}

// ---------------------------------------------------------------------------
// Correos entrantes

export type ResultadoEntrante = {
  // asociado: traía un número TRM existente. creado: se creó el reclamo con el correo.
  // incompleto: reporte por correo B-000123 a la espera de datos. sin_asociar: a la bandeja.
  estado: 'asociado' | 'creado' | 'incompleto' | 'sin_asociar' | 'duplicado';
  reclamoId: number | null;
  adjuntos: number;
  numero?: string;
  borrador?: string;
  faltan?: string[];
};

type AdjuntoGuardado = { pathname: string; nombre: string; tamano: number; contentType: string };

// Lo que se guarda en correos_recibidos.datos.
export type DatosCorreo = {
  de: string;
  deNombre: string;
  asunto: string;
  texto: string;
  fuente: NombreProveedorCorreo;
  adjuntos: AdjuntoGuardado[];
  omitidos?: string[]; // adjuntos de más de 25 MB (siguen en el buzón)
};

const nombreArchivo = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-120) || 'adjunto';

// Eventos del caso para un correo recibido: la comunicación y un documento por adjunto.
function eventosDeCorreo(mensajeId: string, recibidoEn: string, d: DatosCorreo, adjuntos: AdjuntoGuardado[], extra: object = {}) {
  return [
    {
      tipo: 'comunicacion',
      datos: {
        canal: 'correo',
        resultado: 'respuesta_recibida',
        direccion: 'entrante',
        envio: d.fuente,
        de: d.de,
        asunto: d.asunto,
        texto: d.texto,
        mensajeId,
        recibidoEn,
        ...(adjuntos.length && { adjuntos: adjuntos.map((a) => a.nombre) }),
        ...extra,
      },
    },
    ...adjuntos.map((a) => ({
      tipo: 'documento',
      datos: { ...a, tipoDocumento: 'correo', descripcion: `Adjunto del correo «${d.asunto}» de ${d.de}`.slice(0, 300) },
    })),
  ];
}

// Guarda un correo entrante. Si trae un número de reclamo existente en el asunto,
// lo agrega al historial del caso (como comunicación recibida), sube sus adjuntos
// como documentos y marca el caso con "correo nuevo". Si no, queda en
// correos_recibidos sin caso, con sus adjuntos en correos/, para asociarlo
// después desde el panel. Un mismo mensaje nunca se registra dos veces.
export async function procesarEntrante(c: CorreoEntrante, fuente: NombreProveedorCorreo): Promise<ResultadoEntrante> {
  await asegurarTabla();
  const [ya] = await sql`SELECT reclamo_id FROM correos_recibidos WHERE mensaje_id = ${c.mensajeId}`;
  if (ya) return { estado: 'duplicado', reclamoId: ya.reclamo_id, adjuntos: 0 };

  const numero = numeroEnAsunto(c.asunto);
  const [caso] = numero ? await sql`SELECT id FROM reclamos_terremoto WHERE id = ${numero}` : [];
  const reclamoId: number | null = caso?.id ?? null;
  const datos: DatosCorreo = {
    de: c.de.slice(0, 200),
    deNombre: c.deNombre.slice(0, 200),
    asunto: c.asunto.slice(0, 300),
    texto: c.texto.trim().slice(0, 8000),
    fuente,
    adjuntos: [],
  };

  // Los adjuntos se suben primero; si después falla el registro, se reintentará
  // el correo completo (sigue sin leer en el buzón).
  const carpeta = reclamoId ? `documentos/${reclamoId}` : `correos/${c.recibidoEn.slice(0, 10)}`;
  for (const a of c.adjuntos) {
    if (a.contenido.byteLength > MAX_BYTES_DOCUMENTO) {
      (datos.omitidos ??= []).push(a.nombre.slice(0, 200));
      continue;
    }
    const blob = await conReintentos(() =>
      put(`${carpeta}/${nombreArchivo(a.nombre)}`, Buffer.from(a.contenido), { access: 'private', contentType: a.tipo, addRandomSuffix: true }),
    );
    datos.adjuntos.push({ pathname: blob.pathname, nombre: a.nombre.slice(0, 200), tamano: a.contenido.byteLength, contentType: a.tipo });
  }

  const autor = datos.deNombre || datos.de || 'Correo entrante';
  const eventos = eventosDeCorreo(c.mensajeId, c.recibidoEn, datos, datos.adjuntos);

  // Una sola sentencia: registra el correo, marca el caso y agrega los eventos.
  const filas = await sql`
    WITH nuevo AS (
      INSERT INTO correos_recibidos (mensaje_id, reclamo_id, recibido_en, datos)
      VALUES (${c.mensajeId}, ${reclamoId}, ${c.recibidoEn}, ${JSON.stringify(datos)}::jsonb)
      ON CONFLICT (mensaje_id) DO NOTHING
      RETURNING reclamo_id
    ),
    caso AS (
      UPDATE reclamos_terremoto SET correo_nuevo = true, actualizado_en = now()
      WHERE id IN (SELECT reclamo_id FROM nuevo)
      RETURNING id
    ),
    eventos AS (
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT caso.id, ${autor}, e.value->>'tipo', e.value->'datos'
      FROM caso, jsonb_array_elements(${JSON.stringify(eventos)}::jsonb) WITH ORDINALITY AS e(value, n)
      ORDER BY e.n
      RETURNING id
    )
    SELECT (SELECT count(*) FROM nuevo)::int AS nuevos, (SELECT count(*) FROM eventos)::int AS eventos`;
  if (!filas[0]?.nuevos) return { estado: 'duplicado', reclamoId, adjuntos: 0 };
  if (reclamoId) return { estado: 'asociado', reclamoId, adjuntos: datos.adjuntos.length };

  // Sin caso: ¿es un reporte de daños? Se intenta crear el reclamo solo.
  // Si falla, el correo queda en la bandeja para una persona (y se puede reintentar desde ahí).
  const ingreso = await ingresarPorCorreo(c.mensajeId).catch((e) => {
    console.error('Falló el ingreso automático; el correo queda en la bandeja', c.mensajeId, e);
    return { estado: 'no_es_reporte' as const };
  });
  if (ingreso.estado === 'creado') return { estado: 'creado', reclamoId: ingreso.reclamoId, adjuntos: datos.adjuntos.length, numero: ingreso.numero, borrador: ingreso.borrador };
  if (ingreso.estado === 'incompleto') return { estado: 'incompleto', reclamoId: null, adjuntos: datos.adjuntos.length, borrador: ingreso.borrador, faltan: ingreso.faltan };
  return { estado: 'sin_asociar', reclamoId: null, adjuntos: datos.adjuntos.length };
}

// Asocia a un caso un correo que llegó sin número: copia sus adjuntos a los
// documentos del caso y lo agrega al historial. Devuelve null si el correo ya
// no está pendiente (otra persona lo asoció o descartó un momento antes).
export async function asociarCorreo(mensajeId: string, reclamoId: number, usuario: string) {
  const [fila] = await sql`
    SELECT recibido_en, datos FROM correos_recibidos WHERE mensaje_id = ${mensajeId} AND reclamo_id IS NULL AND descartado_en IS NULL`;
  if (!fila) return null;
  const datos = fila.datos as DatosCorreo;
  const adjuntos: AdjuntoGuardado[] = [];
  for (const a of datos.adjuntos ?? []) {
    const blob = await conReintentos(() =>
      copy(a.pathname, `documentos/${reclamoId}/${nombreArchivo(a.nombre)}`, { access: 'private', contentType: a.contentType, addRandomSuffix: true }),
    );
    adjuntos.push({ ...a, pathname: blob.pathname });
  }
  const recibidoEn = new Date(fila.recibido_en).toISOString();
  const eventos = eventosDeCorreo(mensajeId, recibidoEn, datos, adjuntos, { asociadoPor: usuario });
  const autor = datos.deNombre || datos.de || 'Correo entrante';
  const filas = await sql`
    WITH correo AS (
      UPDATE correos_recibidos SET reclamo_id = ${reclamoId}, gestionado_por = ${usuario}, gestionado_en = now()
      WHERE mensaje_id = ${mensajeId} AND reclamo_id IS NULL AND descartado_en IS NULL
      RETURNING reclamo_id
    ),
    caso AS (
      UPDATE reclamos_terremoto SET correo_nuevo = true, actualizado_en = now()
      WHERE id IN (SELECT reclamo_id FROM correo)
      RETURNING id
    )
    INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
    SELECT caso.id, ${autor}, e.value->>'tipo', e.value->'datos'
    FROM caso, jsonb_array_elements(${JSON.stringify(eventos)}::jsonb) WITH ORDINALITY AS e(value, n)
    ORDER BY e.n
    RETURNING id`;
  return filas.length ? { adjuntos: adjuntos.length } : null;
}

// Marca como descartado (publicidad, sin relación con reclamos) un correo sin
// caso. No se borra: sigue en correos_recibidos y en el respaldo.
export async function descartarCorreo(mensajeId: string, usuario: string) {
  const filas = await sql`
    UPDATE correos_recibidos SET descartado_en = now(), gestionado_por = ${usuario}, gestionado_en = now()
    WHERE mensaje_id = ${mensajeId} AND reclamo_id IS NULL AND descartado_en IS NULL
    RETURNING mensaje_id`;
  return filas.length > 0;
}

// Lee los correos nuevos del buzón y los guarda. Lo usan el cron y el panel.
export async function sincronizarBuzon(maximo = 25) {
  const proveedor = proveedorCorreo();
  // Leer un correo con Claude toma segundos: menos correos por vuelta (el resto sigue sin leer).
  const correos = await proveedor.recibir(process.env.EXTRACTOR_PROVEEDOR === 'claude' ? Math.min(maximo, 5) : maximo);
  const resultado = { leidos: correos.length, asociados: 0, creados: 0, incompletos: 0, sinAsociar: 0, errores: 0 };
  for (const c of correos) {
    try {
      const r = await procesarEntrante(c, proveedor.nombre);
      if (r.estado === 'asociado') resultado.asociados++;
      if (r.estado === 'creado') resultado.creados++;
      if (r.estado === 'incompleto') resultado.incompletos++;
      if (r.estado === 'sin_asociar') resultado.sinAsociar++;
      await proveedor.marcarLeido(c.mensajeId);
    } catch (e) {
      // Queda sin leer en el buzón y se reintenta en la próxima sincronización.
      console.error('No se pudo guardar el correo', c.mensajeId, e);
      resultado.errores++;
    }
  }
  return resultado;
}
