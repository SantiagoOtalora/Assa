// Emite el token para que el panel suba documentos directo a Blob (privado),
// sin pasar el archivo por la función (límite de 4.5 MB). Requiere sesión.
// Después de subirlo, el panel lo registra con POST /api/gestion { tipo: 'documento' }.
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { MAX_BYTES_DOCUMENTO, TIPOS_ARCHIVO_DOCUMENTO } from '../shared/flujo.js';
import { asegurarTabla, sql } from './_db.js';
import { permisosDe } from '../shared/roles.js';
import { noAutorizado, prohibido, puedeVerCaso, usuarioDeSesion } from './_sesion.js';

const RUTA = /^documentos\/(\d+)\/[\w.-]{1,150}$/;

export async function POST(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  const permisos = permisosDe(u.rol);
  if (!permisos.documentos) return prohibido();
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || body.type !== 'blob.generate-client-token') return Response.json({ error: 'Solicitud inválida.' }, { status: 400 });
  try {
    const resultado = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const id = Number(RUTA.exec(pathname)?.[1]);
        if (!id) throw new Error('Ruta de documento inválida.');
        await asegurarTabla();
        const [caso] = await sql`SELECT id FROM reclamos_terremoto WHERE id = ${id}`;
        if (!caso) throw new Error('El caso no existe.');
        if (!(await puedeVerCaso(u, id, permisos.verTodos))) throw new Error('No tiene acceso a este caso.');
        return {
          allowedContentTypes: TIPOS_ARCHIVO_DOCUMENTO,
          maximumSizeInBytes: MAX_BYTES_DOCUMENTO,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(resultado);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'No se pudo preparar la subida.' }, { status: 400 });
  }
}
