import { put } from '@vercel/blob';
import { conReintentos, guardarReclamo, type Reclamo } from './_db.js';
import { demasiadas, dentroDelLimite } from './_limites.js';
import {
  EXTENSION,
  HABITABILIDAD,
  IDS_DANO,
  LARGO_MAX_DESCRIPCION,
  LARGO_MIN_DESCRIPCION,
  MAX_BYTES_FOTO,
  MAX_FOTOS,
  OPERACION,
  PROVINCIAS,
  RE_CORREO,
  RE_TELEFONO,
  RIESGOS,
  TIPOS_PROPIEDAD,
  calcularPrioridad,
  normalizarTelefono,
} from '../shared/catalogos.js';
import { REPORTANTES } from '../shared/flujo.js';

type Datos = {
  nombre: string;
  poliza: string;
  unidad: string;
  correo: string;
  telefono: string;
  provincia: string;
  distrito: string;
  direccion: string;
  tipoPropiedad: string;
  tiposDano: string[];
  habitabilidad: string;
  riesgos: string[];
  extension: string;
  operacion: string;
  fechaDano: string;
  descripcion: string;
  consentimiento: boolean;
  reportadoPor: string;
  reportanteNombre: string;
  reportanteCodigo: string;
  reportanteCorreo: string;
  reportanteTelefono: string;
  sitioWeb?: string;
};

function texto(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function validar(d: Datos): string | null {
  if (!REPORTANTES.some((x) => x.id === d.reportadoPor)) return 'Indique quién reporta.';
  if (d.reportadoPor !== 'asegurado') {
    if (!d.reportanteNombre) return 'Ingrese el nombre de quien reporta.';
    if (!RE_CORREO.test(d.reportanteCorreo)) return 'El correo de quien reporta no es válido.';
    if (d.reportanteTelefono && !RE_TELEFONO.test(d.reportanteTelefono)) return 'El teléfono de quien reporta no es válido.';
  }
  if (!d.nombre) return 'Ingrese el nombre completo del asegurado.';
  if (!d.poliza) return 'Ingrese el número de póliza.';
  // Si reporta un corredor o ejecutivo, el contacto del asegurado es opcional.
  const contactoOpcional = d.reportadoPor !== 'asegurado';
  if (!(contactoOpcional && !d.correo) && !RE_CORREO.test(d.correo)) return 'El correo electrónico no es válido.';
  if (!(contactoOpcional && !d.telefono) && !RE_TELEFONO.test(d.telefono)) return 'El número de teléfono no es válido.';
  if (!PROVINCIAS[d.provincia]?.includes(d.distrito)) return 'Seleccione provincia y distrito.';
  if (!d.direccion) return 'Ingrese la dirección del inmueble.';
  if (!(TIPOS_PROPIEDAD as readonly string[]).includes(d.tipoPropiedad)) return 'Seleccione el tipo de inmueble.';
  if (!d.tiposDano.length || !d.tiposDano.every((t) => IDS_DANO.includes(t))) return 'Seleccione al menos un tipo de daño.';
  if (!HABITABILIDAD.some((h) => h.id === d.habitabilidad)) return 'Indique si el inmueble es habitable.';
  if (!d.riesgos.every((r) => RIESGOS.some((x) => x.id === r))) return 'Situación de riesgo no válida.';
  if (!EXTENSION.some((x) => x.id === d.extension)) return 'Indique qué tanto del inmueble está afectado.';
  if (d.tipoPropiedad !== 'Residencial' && !OPERACION.some((x) => x.id === d.operacion))
    return 'Indique si la operación está detenida.';
  const fecha = new Date(d.fechaDano + 'T00:00:00Z');
  if (Number.isNaN(fecha.getTime()) || fecha.getTime() > Date.now() + 86_400_000) return 'La fecha del daño no es válida.';
  if (d.descripcion.length < LARGO_MIN_DESCRIPCION) return 'Describa las afectaciones con un poco más de detalle.';
  if (!d.consentimiento) return 'Debe autorizar el uso de sus datos para tramitar el reclamo.';
  return null;
}

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

  const datos: Datos = {
    nombre: texto(crudo.nombre, 120),
    poliza: texto(crudo.poliza, 40).toUpperCase(),
    unidad: texto(crudo.unidad, 40),
    correo: texto(crudo.correo, 160).toLowerCase(),
    telefono: normalizarTelefono(texto(crudo.telefono, 30)),
    provincia: texto(crudo.provincia),
    distrito: texto(crudo.distrito),
    direccion: texto(crudo.direccion, 300),
    tipoPropiedad: texto(crudo.tipoPropiedad),
    tiposDano: Array.isArray(crudo.tiposDano) ? [...new Set(crudo.tiposDano.map((t) => texto(t, 40)))] : [],
    habitabilidad: texto(crudo.habitabilidad),
    riesgos: Array.isArray(crudo.riesgos) ? [...new Set(crudo.riesgos.map((t) => texto(t, 20)))] : [],
    extension: texto(crudo.extension),
    operacion: texto(crudo.operacion),
    fechaDano: texto(crudo.fechaDano, 10),
    descripcion: texto(crudo.descripcion, LARGO_MAX_DESCRIPCION),
    consentimiento: crudo.consentimiento === true,
    reportadoPor: texto(crudo.reportadoPor, 20) || 'asegurado',
    reportanteNombre: texto(crudo.reportanteNombre, 120),
    reportanteCodigo: texto(crudo.reportanteCodigo, 40).toUpperCase(),
    reportanteCorreo: texto(crudo.reportanteCorreo, 160).toLowerCase(),
    reportanteTelefono: normalizarTelefono(texto(crudo.reportanteTelefono, 30)),
    sitioWeb: texto(crudo.sitioWeb),
  };

  // El navegador genera la ref una vez por reporte: si reintenta, no se duplica.
  const refCliente = texto(crudo.ref, 36).toLowerCase();
  const ref = RE_UUID.test(refCliente) ? refCliente : crypto.randomUUID();

  // Campo trampa: los bots lo llenan, las personas no lo ven.
  if (datos.sitioWeb) return respuesta(200, { numero: 'TRM-000000' });

  const error = validar(datos);
  if (error) return respuesta(400, { error });
  if (datos.tipoPropiedad === 'Residencial') datos.operacion = '';
  if (datos.reportadoPor === 'asegurado') {
    datos.reportanteNombre = datos.reportanteCodigo = datos.reportanteCorreo = datos.reportanteTelefono = '';
  }
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
