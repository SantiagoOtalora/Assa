// Datos y documentos de la póliza de un reclamo, desde el conector de pólizas.
//   GET /api/polizas?numero=02-B-123                    -> { poliza, fuente }
//   GET /api/polizas?numero=02-B-123&documento=recibo   -> archivo
// Un ajustador externo solo puede consultar pólizas de sus casos asignados.
import { permisosDe } from '../shared/roles.js';
import { sql } from './_db.js';
import { normalizarPoliza, proveedorPolizas } from './_polizas.js';
import { auditar, noAutorizado, prohibido, usuarioDeSesion } from './_sesion.js';

export async function GET(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  const params = new URL(request.url).searchParams;
  const numero = normalizarPoliza(params.get('numero') ?? '');
  const documento = params.get('documento');
  if (!numero || numero.length > 40) return Response.json({ error: 'Número de póliza inválido.' }, { status: 400 });

  if (!permisosDe(u.rol).verTodos) {
    const [caso] = await sql`
      SELECT 1 FROM reclamos_terremoto WHERE asignado_usuario_id = ${u.id} AND upper(replace(poliza, ' ', '')) = ${numero}`;
    if (!caso) return prohibido();
  }

  const proveedor = proveedorPolizas();
  try {
    if (documento) {
      const archivo = await proveedor.documento(numero, documento);
      if (!archivo) return Response.json({ error: 'Documento no encontrado.' }, { status: 404 });
      await auditar(u.id, 'ver_documento_poliza', null, { poliza: numero, documento });
      return new Response(archivo.cuerpo, {
        headers: {
          'content-type': archivo.tipo,
          'content-disposition': `inline; filename="${encodeURIComponent(archivo.nombre)}"`,
          'cache-control': 'private, max-age=300',
          'x-content-type-options': 'nosniff',
        },
      });
    }
    const poliza = await proveedor.buscar(numero);
    await auditar(u.id, 'ver_poliza', null, { poliza: numero, encontrada: !!poliza });
    if (!poliza) return Response.json({ error: 'No encontramos esa póliza en el sistema.', fuente: proveedor.nombre }, { status: 404 });
    return Response.json({ poliza, fuente: proveedor.nombre }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('Error consultando pólizas', e);
    return Response.json({ error: 'El sistema de pólizas no respondió. Intente de nuevo en unos minutos.' }, { status: 502 });
  }
}
