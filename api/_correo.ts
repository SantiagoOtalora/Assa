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
import { put } from '@vercel/blob';
import { MAX_BYTES_DOCUMENTO } from '../shared/flujo.js';
import { asegurarTabla, conReintentos, sql } from './_db.js';

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
export function correoEntranteSimulado(caso: { numero: string; nombre: string; correo: string }, texto?: string): CorreoEntrante {
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

export type ResultadoEntrante = { estado: 'asociado' | 'sin_asociar' | 'duplicado'; reclamoId: number | null; adjuntos: number };

const nombreArchivo = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-120) || 'adjunto';

// Guarda un correo entrante. Si trae un número de reclamo existente en el asunto,
// lo agrega al historial del caso (como comunicación recibida), sube sus adjuntos
// como documentos y marca el caso con "correo nuevo". Si no, queda en
// correos_recibidos sin caso. Un mismo mensaje nunca se registra dos veces.
export async function procesarEntrante(c: CorreoEntrante, fuente: NombreProveedorCorreo): Promise<ResultadoEntrante> {
  await asegurarTabla();
  const [ya] = await sql`SELECT reclamo_id FROM correos_recibidos WHERE mensaje_id = ${c.mensajeId}`;
  if (ya) return { estado: 'duplicado', reclamoId: ya.reclamo_id, adjuntos: 0 };

  const numero = numeroEnAsunto(c.asunto);
  const [caso] = numero ? await sql`SELECT id FROM reclamos_terremoto WHERE id = ${numero}` : [];
  const reclamoId: number | null = caso?.id ?? null;
  const de = c.de.slice(0, 200);
  const deNombre = c.deNombre.slice(0, 200);
  const asunto = c.asunto.slice(0, 300);
  const texto = c.texto.trim().slice(0, 8000);

  // Los adjuntos se suben primero; si después falla el registro, se reintentará
  // el correo completo (sigue sin leer en el buzón).
  const documentos: { pathname: string; nombre: string; tamano: number; contentType: string }[] = [];
  if (reclamoId) {
    for (const a of c.adjuntos) {
      if (a.contenido.byteLength > MAX_BYTES_DOCUMENTO) continue;
      const blob = await conReintentos(() =>
        put(`documentos/${reclamoId}/${nombreArchivo(a.nombre)}`, Buffer.from(a.contenido), {
          access: 'private',
          contentType: a.tipo,
          addRandomSuffix: true,
        }),
      );
      documentos.push({ pathname: blob.pathname, nombre: a.nombre.slice(0, 200), tamano: a.contenido.byteLength, contentType: a.tipo });
    }
  }

  const autor = deNombre || de || 'Correo entrante';
  const eventos = [
    {
      tipo: 'comunicacion',
      datos: {
        canal: 'correo',
        resultado: 'respuesta_recibida',
        direccion: 'entrante',
        envio: fuente,
        de,
        asunto,
        texto,
        mensajeId: c.mensajeId,
        recibidoEn: c.recibidoEn,
        ...(documentos.length && { adjuntos: documentos.map((d) => d.nombre) }),
      },
    },
    ...documentos.map((d) => ({
      tipo: 'documento',
      datos: { ...d, tipoDocumento: 'correo', descripcion: `Adjunto del correo «${asunto}» de ${de}`.slice(0, 300) },
    })),
  ];
  const resumen = { de, deNombre, asunto, texto, adjuntos: c.adjuntos.map((a) => a.nombre), fuente };

  // Una sola sentencia: registra el correo, marca el caso y agrega los eventos.
  const filas = await sql`
    WITH nuevo AS (
      INSERT INTO correos_recibidos (mensaje_id, reclamo_id, recibido_en, datos)
      VALUES (${c.mensajeId}, ${reclamoId}, ${c.recibidoEn}, ${JSON.stringify(resumen)}::jsonb)
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
  return { estado: reclamoId ? 'asociado' : 'sin_asociar', reclamoId, adjuntos: documentos.length };
}

// Lee los correos nuevos del buzón y los guarda. Lo usan el cron y el panel.
export async function sincronizarBuzon(maximo = 25) {
  const proveedor = proveedorCorreo();
  const correos = await proveedor.recibir(maximo);
  const resultado = { leidos: correos.length, asociados: 0, sinAsociar: 0, errores: 0 };
  for (const c of correos) {
    try {
      const r = await procesarEntrante(c, proveedor.nombre);
      if (r.estado === 'asociado') resultado.asociados++;
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
