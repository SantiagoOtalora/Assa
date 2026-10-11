// Acceso a la base de datos compartido por las funciones de api/.
// Los archivos de api/ que empiezan con "_" no se publican como rutas.
import { neon } from '@neondatabase/serverless';
import type { Prioridad } from '../shared/catalogos.js';

export const sql = neon(process.env.DATABASE_URL!);

// Un reclamo completo, tal como se guarda en la tabla o, si la base de
// datos no responde, como respaldo JSON en Blob (pendientes/).
export type Reclamo = {
  ref: string;
  recibidoEn: string;
  prioridad: Prioridad;
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
  fotos: string[];
  consentimiento: boolean;
};

let tablaLista: Promise<unknown> | undefined;

// Solo crea o agrega: nunca borra ni modifica columnas existentes.
export function asegurarTabla() {
  tablaLista ??= crearTabla().catch((e) => {
    tablaLista = undefined;
    throw e;
  });
  return tablaLista;
}

async function crearTabla() {
  await sql`
    CREATE TABLE IF NOT EXISTS reclamos_terremoto (
      id              serial PRIMARY KEY,
      numero          text GENERATED ALWAYS AS ('TRM-' || lpad(id::text, 6, '0')) STORED,
      creado_en       timestamptz NOT NULL DEFAULT now(),
      estado          text NOT NULL DEFAULT 'recibido',
      prioridad       text NOT NULL DEFAULT 'baja',
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
      riesgos         text[] NOT NULL DEFAULT '{}',
      extension       text NOT NULL DEFAULT '',
      operacion       text,
      fecha_dano      date NOT NULL,
      descripcion     text NOT NULL,
      fotos           text[] NOT NULL DEFAULT '{}',
      consentimiento  boolean NOT NULL
    )`;
  // Columnas agregadas después de crear la tabla.
  await sql`
    ALTER TABLE reclamos_terremoto
      ADD COLUMN IF NOT EXISTS prioridad text NOT NULL DEFAULT 'baja',
      ADD COLUMN IF NOT EXISTS riesgos   text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS extension text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS operacion text,
      ADD COLUMN IF NOT EXISTS ref       text UNIQUE`;
}

// Inserta el reclamo; si ya existe uno con la misma ref no lo duplica.
// Devuelve el número TRM asignado (nuevo o existente).
export async function guardarReclamo(r: Reclamo): Promise<string> {
  await asegurarTabla();
  const [fila] = await sql`
    INSERT INTO reclamos_terremoto (
      ref, creado_en, prioridad, nombre, poliza, unidad, correo, telefono, provincia, distrito,
      direccion, tipo_propiedad, tipos_dano, habitabilidad, riesgos, extension, operacion,
      fecha_dano, descripcion, fotos, consentimiento
    ) VALUES (
      ${r.ref}, ${r.recibidoEn}, ${r.prioridad}, ${r.nombre}, ${r.poliza}, ${r.unidad || null},
      ${r.correo}, ${r.telefono}, ${r.provincia}, ${r.distrito}, ${r.direccion}, ${r.tipoPropiedad},
      ${r.tiposDano}, ${r.habitabilidad}, ${r.riesgos}, ${r.extension}, ${r.operacion || null},
      ${r.fechaDano}, ${r.descripcion}, ${r.fotos}, ${r.consentimiento}
    )
    ON CONFLICT (ref) DO UPDATE SET ref = EXCLUDED.ref
    RETURNING numero`;
  return fila.numero as string;
}

export async function conReintentos<T>(fn: () => Promise<T>, esperasMs = [400, 1200]): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await fn();
    } catch (e) {
      if (intento >= esperasMs.length) throw e;
      console.warn(`Reintentando (${intento + 1}/${esperasMs.length})`, e);
      await new Promise((ok) => setTimeout(ok, esperasMs[intento]));
    }
  }
}
