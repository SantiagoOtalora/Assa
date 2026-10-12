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
  reportadoPor?: string;
  reportanteNombre?: string;
  reportanteCodigo?: string;
  reportanteCorreo?: string;
  reportanteTelefono?: string;
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
  // Gestión del caso: estado actual (la columna estado ya existe), asignación y
  // fechas. El detalle de cada cambio queda en reclamo_eventos.
  await sql`
    ALTER TABLE reclamos_terremoto
      ADD COLUMN IF NOT EXISTS asignado_a       text,
      ADD COLUMN IF NOT EXISTS fecha_inspeccion date,
      ADD COLUMN IF NOT EXISTS motivo_cierre    text,
      ADD COLUMN IF NOT EXISTS actualizado_en   timestamptz`;
  // Historial de gestión: solo se agregan filas, nunca se modifican ni borran.
  await sql`
    CREATE TABLE IF NOT EXISTS reclamo_eventos (
      id          bigserial PRIMARY KEY,
      reclamo_id  integer NOT NULL REFERENCES reclamos_terremoto (id),
      creado_en   timestamptz NOT NULL DEFAULT now(),
      autor       text NOT NULL,
      tipo        text NOT NULL,
      datos       jsonb NOT NULL DEFAULT '{}'
    )`;
  await sql`CREATE INDEX IF NOT EXISTS reclamo_eventos_reclamo ON reclamo_eventos (reclamo_id, creado_en)`;
  // Fase 1: quién reporta, análisis (causa y coberturas afectadas) y fases nuevas.
  await sql`
    ALTER TABLE reclamos_terremoto
      ADD COLUMN IF NOT EXISTS reportado_por       text NOT NULL DEFAULT 'asegurado',
      ADD COLUMN IF NOT EXISTS reportante_nombre   text,
      ADD COLUMN IF NOT EXISTS reportante_codigo   text,
      ADD COLUMN IF NOT EXISTS reportante_correo   text,
      ADD COLUMN IF NOT EXISTS reportante_telefono text,
      ADD COLUMN IF NOT EXISTS causa               text,
      ADD COLUMN IF NOT EXISTS coberturas          jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS analisis_version    integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS fase_desde          timestamptz`;
  await sql`ALTER TABLE reclamos_terremoto ALTER COLUMN estado SET DEFAULT 'ingresado'`;
  // Fase 2: usuarios con rol, asignación a usuarios y auditoría de accesos.
  await sql`
    CREATE TABLE IF NOT EXISTS usuarios (
      id            serial PRIMARY KEY,
      correo        text NOT NULL UNIQUE,
      nombre        text NOT NULL,
      rol           text NOT NULL,
      organizacion  text,
      clave_hash    text NOT NULL,
      activo        boolean NOT NULL DEFAULT true,
      creado_en     timestamptz NOT NULL DEFAULT now(),
      ultimo_acceso timestamptz
    )`;
  await sql`ALTER TABLE reclamos_terremoto ADD COLUMN IF NOT EXISTS asignado_usuario_id integer REFERENCES usuarios (id)`;
  // Auditoría: solo se agregan filas.
  await sql`
    CREATE TABLE IF NOT EXISTS auditoria (
      id          bigserial PRIMARY KEY,
      creado_en   timestamptz NOT NULL DEFAULT now(),
      usuario_id  integer REFERENCES usuarios (id),
      accion      text NOT NULL,
      reclamo_id  integer,
      detalle     jsonb NOT NULL DEFAULT '{}'
    )`;
  // Correo (api/_correo.ts): cada correo leído del buzón, asociado o no a un caso
  // (solo se agregan filas), y el aviso de correo nuevo en el caso.
  await sql`
    CREATE TABLE IF NOT EXISTS correos_recibidos (
      mensaje_id   text PRIMARY KEY,
      reclamo_id   integer REFERENCES reclamos_terremoto (id),
      recibido_en  timestamptz NOT NULL,
      guardado_en  timestamptz NOT NULL DEFAULT now(),
      datos        jsonb NOT NULL DEFAULT '{}'
    )`;
  await sql`ALTER TABLE reclamos_terremoto ADD COLUMN IF NOT EXISTS correo_nuevo boolean NOT NULL DEFAULT false`;
  // Bandeja de correos sin caso: se asocian a un caso o se descartan (no se borran).
  await sql`
    ALTER TABLE correos_recibidos
      ADD COLUMN IF NOT EXISTS descartado_en  timestamptz,
      ADD COLUMN IF NOT EXISTS gestionado_por text,
      ADD COLUMN IF NOT EXISTS gestionado_en  timestamptz`;
  // Límite de solicitudes por IP (api/_limites.ts): solo contadores, sin datos personales.
  await sql`
    CREATE TABLE IF NOT EXISTS limites (
      clave    text NOT NULL,
      ventana  bigint NOT NULL,
      conteo   integer NOT NULL,
      PRIMARY KEY (clave, ventana)
    )`;
  // Renombra las fases de la primera versión del flujo (equivalentes); el
  // historial en reclamo_eventos conserva los valores originales.
  await sql`
    UPDATE reclamos_terremoto
    SET estado = CASE estado
      WHEN 'recibido' THEN 'ingresado'
      WHEN 'en_revision' THEN 'en_analisis'
      WHEN 'pendiente_asegurado' THEN 'esperando_info'
      WHEN 'inspeccion_programada' THEN 'con_ajustador'
      WHEN 'inspeccionado' THEN 'con_ajustador'
      WHEN 'en_ajuste' THEN 'con_ajustador'
      WHEN 'cerrado' THEN CASE WHEN motivo_cierre = 'indemnizado' THEN 'pagado' ELSE 'declinado' END
    END
    WHERE estado IN ('recibido', 'en_revision', 'pendiente_asegurado', 'inspeccion_programada', 'inspeccionado', 'en_ajuste', 'cerrado')`;
}

// Inserta el reclamo; si ya existe uno con la misma ref no lo duplica.
// Devuelve el número TRM asignado (nuevo o existente).
export async function guardarReclamo(r: Reclamo): Promise<string> {
  await asegurarTabla();
  const [fila] = await sql`
    INSERT INTO reclamos_terremoto (
      ref, creado_en, prioridad, nombre, poliza, unidad, correo, telefono, provincia, distrito,
      direccion, tipo_propiedad, tipos_dano, habitabilidad, riesgos, extension, operacion,
      fecha_dano, descripcion, fotos, consentimiento, fase_desde,
      reportado_por, reportante_nombre, reportante_codigo, reportante_correo, reportante_telefono
    ) VALUES (
      ${r.ref}, ${r.recibidoEn}, ${r.prioridad}, ${r.nombre}, ${r.poliza}, ${r.unidad || null},
      ${r.correo}, ${r.telefono}, ${r.provincia}, ${r.distrito}, ${r.direccion}, ${r.tipoPropiedad},
      ${r.tiposDano}, ${r.habitabilidad}, ${r.riesgos}, ${r.extension}, ${r.operacion || null},
      ${r.fechaDano}, ${r.descripcion}, ${r.fotos}, ${r.consentimiento}, ${r.recibidoEn},
      ${r.reportadoPor ?? 'asegurado'}, ${r.reportanteNombre || null}, ${r.reportanteCodigo || null},
      ${r.reportanteCorreo || null}, ${r.reportanteTelefono || null}
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
