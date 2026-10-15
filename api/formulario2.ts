// Formulario 2 (/formulario2): público, sin acceso.
//   POST /api/formulario2 { reclamo, poliza, unidad?, tiposDano, habitabilidad, riesgos, sinRiesgos, descripcion?, ref }
//        -> 201 { numero: "F2-000123" }
//   GET  /api/formulario2 -> reportes recibidos (panel; requiere sesión de un rol que ve todos los reclamos)
// Mismas protecciones que el formulario principal: límite por IP, ref para no duplicar y,
// si la base de datos no responde, respaldo en Blob (pendientes-f2/) que carga el cron diario.
import { put } from '@vercel/blob';
import { permisosDe } from '../shared/roles.js';
import { asegurarTabla, conReintentos, sql } from './_db.js';
import { guardarF2, normalizarF2, validarF2, type ReporteF2 } from './_formulario2.js';
import { demasiadas, dentroDelLimite } from './_limites.js';
import { auditar, noAutorizado, prohibido, usuarioDeSesion } from './_sesion.js';
import { texto } from './_validacion.js';

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const respuesta = (status: number, body: object) => Response.json(body, { status });

export async function POST(request: Request) {
  if (!(await dentroDelLimite(request, 'formulario2'))) {
    return demasiadas('Recibimos muchos reportes desde su conexión en poco tiempo. Sus datos siguen en este formulario: intente de nuevo en unos minutos.');
  }
  const crudo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!crudo || typeof crudo !== 'object') return respuesta(400, { error: 'Solicitud inválida.' });

  const datos = normalizarF2(crudo);
  // Campo trampa: los bots lo llenan, las personas no lo ven.
  if (datos.sitioWeb) return respuesta(200, { numero: 'F2-000000' });
  const error = validarF2(datos);
  if (error) return respuesta(400, { error });

  const refCliente = texto(crudo.ref, 36).toLowerCase();
  const { sinRiesgos: _, sitioWeb: __, ...campos } = datos;
  const reporte: ReporteF2 = {
    ...campos,
    ref: RE_UUID.test(refCliente) ? refCliente : crypto.randomUUID(),
    recibidoEn: new Date().toISOString(),
  };

  try {
    return respuesta(201, { numero: await conReintentos(() => guardarF2(reporte)) });
  } catch (e) {
    console.error('Base de datos no disponible; guardando el Formulario 2 en pendientes-f2/', reporte.ref, e);
  }
  try {
    await conReintentos(() =>
      put(`pendientes-f2/${reporte.ref}.json`, JSON.stringify(reporte), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
    );
    return respuesta(201, { numero: `P-${reporte.ref.slice(0, 8).toUpperCase()}` });
  } catch (e) {
    console.error('No se pudo guardar el Formulario 2 ni en la base de datos ni en pendientes-f2/', reporte.ref, e);
    return respuesta(503, { error: 'No pudimos registrar su reporte. Sus datos siguen en este formulario: intente de nuevo en unos minutos.' });
  }
}

export async function GET(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  if (!permisosDe(u.rol).verTodos) return prohibido();
  await asegurarTabla();
  const filas = await sql`
    SELECT f.id, f.numero, f.creado_en, f.reclamo, f.poliza, f.unidad, f.tipos_dano, f.habitabilidad, f.riesgos,
           f.descripcion, r.numero AS reclamo_vinculado
    FROM formulario2 f LEFT JOIN reclamos_terremoto r ON r.id = f.reclamo_id
    ORDER BY f.id DESC`;
  await auditar(u.id, 'ver_formulario2', null, { total: filas.length });
  return Response.json(
    {
      reportes: filas.map((f) => ({
        id: f.id,
        numero: f.numero,
        creadoEn: new Date(f.creado_en).toISOString(),
        reclamo: f.reclamo,
        poliza: f.poliza,
        unidad: f.unidad,
        tiposDano: f.tipos_dano,
        habitabilidad: f.habitabilidad,
        riesgos: f.riesgos,
        descripcion: f.descripcion,
        reclamoVinculado: f.reclamo_vinculado,
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
