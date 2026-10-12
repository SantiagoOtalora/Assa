import { put } from '@vercel/blob';
import { conReintentos, guardarReclamo, type Reclamo } from './_db.js';
import { demasiadas, dentroDelLimite } from './_limites.js';
import { MAX_BYTES_FOTO, MAX_FOTOS, calcularPrioridad } from '../shared/catalogos.js';
import { normalizarDatos, prepararDatos, texto, validar } from './_validacion.js';

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function respuesta(status: number, body: object) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  if (!(await dentroDelLimite(request, 'reclamo'))) {
    return demasiadas('Recibimos muchos reportes desde su conexión en poco tiempo. Sus datos siguen en este formulario: intente de nuevo en unos minutos.');
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respuesta(400, { error: 'Solicitud inválida.' });
  }

  let crudo: Record<string, unknown>;
  try {
    crudo = JSON.parse(String(form.get('datos') ?? ''));
  } catch {
    return respuesta(400, { error: 'Solicitud inválida.' });
  }

  const datos = normalizarDatos(crudo);

  // El navegador genera la ref una vez por reporte: si reintenta, no se duplica.
  const refCliente = texto(crudo.ref, 36).toLowerCase();
  const ref = RE_UUID.test(refCliente) ? refCliente : crypto.randomUUID();

  // Campo trampa: los bots lo llenan, las personas no lo ven.
  if (datos.sitioWeb) return respuesta(200, { numero: 'TRM-000000' });

  const error = validar(datos);
  if (error) return respuesta(400, { error });
  Object.assign(datos, prepararDatos(datos));
  const prioridad = calcularPrioridad(datos);

  const fotos = form.getAll('fotos').filter((f): f is File => f instanceof File);
  if (fotos.length > MAX_FOTOS) return respuesta(400, { error: `Puede adjuntar máximo ${MAX_FOTOS} fotos.` });
  for (const f of fotos) {
    if (!f.type.startsWith('image/')) return respuesta(400, { error: 'Solo se permiten imágenes.' });
    if (f.size > MAX_BYTES_FOTO) return respuesta(400, { error: 'Una de las fotos es demasiado grande.' });
  }

  let rutas: string[];
  try {
    const carpeta = `reclamos/${new Date().toISOString().slice(0, 10)}/${ref}`;
    rutas = await Promise.all(
      fotos.map(async (f, i) => {
        const blob = await put(`${carpeta}/foto-${i + 1}.jpg`, f, {
          access: 'private',
          contentType: f.type,
          allowOverwrite: true,
        });
        return blob.pathname;
      }),
    );
  } catch (e) {
    console.error('Error subiendo fotos', e);
    return respuesta(503, { error: 'No pudimos subir las fotos. Intente de nuevo en unos minutos.' });
  }

  const { sitioWeb: _, ...campos } = datos;
  const reclamo: Reclamo = { ...campos, ref, recibidoEn: new Date().toISOString(), prioridad, fotos: rutas };

  try {
    const numero = await conReintentos(() => guardarReclamo(reclamo));
    return respuesta(201, { numero });
  } catch (e) {
    console.error('Base de datos no disponible; guardando reclamo en pendientes/', ref, e);
  }

  // Respaldo: si la base de datos no responde, el reclamo se guarda como JSON
  // en Blob y el respaldo diario (api/respaldo.ts) lo carga a la tabla.
  try {
    await conReintentos(() =>
      put(`pendientes/${ref}.json`, JSON.stringify(reclamo), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
    );
    return respuesta(201, { numero: `P-${ref.slice(0, 8).toUpperCase()}` });
  } catch (e) {
    console.error('No se pudo guardar el reclamo ni en la base de datos ni en pendientes/', ref, e);
    return respuesta(503, { error: 'No pudimos registrar su reporte. Sus datos siguen en este formulario: intente de nuevo en unos minutos.' });
  }
}
