import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import {
  HABITABILIDAD,
  IDS_DANO,
  LARGO_MAX_DESCRIPCION,
  LARGO_MIN_DESCRIPCION,
  MAX_BYTES_FOTO,
  MAX_FOTOS,
  PROVINCIAS,
  RE_CORREO,
  RE_TELEFONO,
  TIPOS_PROPIEDAD,
  normalizarTelefono,
} from '../shared/catalogos.js';

const sql = neon(process.env.DATABASE_URL!);

let tablaLista: Promise<unknown> | undefined;

function asegurarTabla() {
  tablaLista ??= sql`
    CREATE TABLE IF NOT EXISTS reclamos_terremoto (
      id              serial PRIMARY KEY,
      numero          text GENERATED ALWAYS AS ('TRM-' || lpad(id::text, 6, '0')) STORED,
      creado_en       timestamptz NOT NULL DEFAULT now(),
      estado          text NOT NULL DEFAULT 'recibido',
      nombre          text NOT NULL,
      poliza          text NOT NULL,
      unidad          text,
      correo          text NOT NULL,
      telefono        text NOT NULL,
      provincia       text NOT NULL,
      distrito        text NOT NULL,
      direccion       text NOT NULL,
      tipo_propiedad  text NOT NULL,
      tipos_dano      text[] NOT NULL,
      habitabilidad   text NOT NULL,
      fecha_dano      date NOT NULL,
      descripcion     text NOT NULL,
      fotos           text[] NOT NULL DEFAULT '{}',
      consentimiento  boolean NOT NULL
    )`.catch((e) => {
    tablaLista = undefined;
    throw e;
  });
  return tablaLista;
}

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
  fechaDano: string;
  descripcion: string;
  consentimiento: boolean;
  sitioWeb?: string;
};

function texto(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function validar(d: Datos): string | null {
  if (!d.nombre) return 'Ingrese su nombre completo.';
  if (!d.poliza) return 'Ingrese el número de póliza.';
  if (!RE_CORREO.test(d.correo)) return 'El correo electrónico no es válido.';
  if (!RE_TELEFONO.test(d.telefono)) return 'El número de teléfono no es válido.';
  if (!PROVINCIAS[d.provincia]?.includes(d.distrito)) return 'Seleccione provincia y distrito.';
  if (!d.direccion) return 'Ingrese la dirección del inmueble.';
  if (!(TIPOS_PROPIEDAD as readonly string[]).includes(d.tipoPropiedad)) return 'Seleccione el tipo de inmueble.';
  if (!d.tiposDano.length || !d.tiposDano.every((t) => IDS_DANO.includes(t))) return 'Seleccione al menos un tipo de daño.';
  if (!HABITABILIDAD.some((h) => h.id === d.habitabilidad)) return 'Indique si el inmueble es habitable.';
  const fecha = new Date(d.fechaDano + 'T00:00:00Z');
  if (Number.isNaN(fecha.getTime()) || fecha.getTime() > Date.now() + 86_400_000) return 'La fecha del daño no es válida.';
  if (d.descripcion.length < LARGO_MIN_DESCRIPCION) return 'Describa las afectaciones con un poco más de detalle.';
  if (!d.consentimiento) return 'Debe autorizar el uso de sus datos para tramitar el reclamo.';
  return null;
}

function respuesta(status: number, body: object) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
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
    fechaDano: texto(crudo.fechaDano, 10),
    descripcion: texto(crudo.descripcion, LARGO_MAX_DESCRIPCION),
    consentimiento: crudo.consentimiento === true,
    sitioWeb: texto(crudo.sitioWeb),
  };

  // Campo trampa: los bots lo llenan, las personas no lo ven.
  if (datos.sitioWeb) return respuesta(200, { numero: 'TRM-000000' });

  const error = validar(datos);
  if (error) return respuesta(400, { error });

  const fotos = form.getAll('fotos').filter((f): f is File => f instanceof File);
  if (fotos.length > MAX_FOTOS) return respuesta(400, { error: `Puede adjuntar máximo ${MAX_FOTOS} fotos.` });
  for (const f of fotos) {
    if (!f.type.startsWith('image/')) return respuesta(400, { error: 'Solo se permiten imágenes.' });
    if (f.size > MAX_BYTES_FOTO) return respuesta(400, { error: 'Una de las fotos es demasiado grande.' });
  }

  try {
    const carpeta = `reclamos/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
    const rutas = await Promise.all(
      fotos.map(async (f, i) => {
        const blob = await put(`${carpeta}/foto-${i + 1}.jpg`, f, {
          access: 'private',
          contentType: f.type,
        });
        return blob.pathname;
      }),
    );

    await asegurarTabla();
    const [fila] = await sql`
      INSERT INTO reclamos_terremoto (
        nombre, poliza, unidad, correo, telefono, provincia, distrito, direccion,
        tipo_propiedad, tipos_dano, habitabilidad, fecha_dano, descripcion, fotos, consentimiento
      ) VALUES (
        ${datos.nombre}, ${datos.poliza}, ${datos.unidad || null}, ${datos.correo}, ${datos.telefono},
        ${datos.provincia}, ${datos.distrito}, ${datos.direccion}, ${datos.tipoPropiedad},
        ${datos.tiposDano}, ${datos.habitabilidad}, ${datos.fechaDano}, ${datos.descripcion},
        ${rutas}, ${datos.consentimiento}
      )
      RETURNING numero`;

    return respuesta(201, { numero: fila.numero });
  } catch (e) {
    console.error('Error guardando reclamo', e);
    return respuesta(500, { error: 'No pudimos registrar su reclamo. Intente de nuevo en unos minutos.' });
  }
}
