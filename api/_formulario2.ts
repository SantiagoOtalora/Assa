// Formulario 2: reporte de daños de un reclamo que ya existe (número de reclamo y
// póliza), en su propia tabla `formulario2`. Validación y guardado compartidos por la
// ruta pública (api/formulario2.ts) y el respaldo diario (pendientes-f2/).
import { HABITABILIDAD, IDS_DANO, RIESGOS } from '../shared/catalogos.js';
import { asegurarTabla, sql } from './_db.js';
import { texto } from './_validacion.js';

export const LARGO_MAX_DESCRIPCION_F2 = 1500;

export type ReporteF2 = {
  ref: string;
  recibidoEn: string;
  reclamo: string;
  poliza: string;
  unidad: string;
  tiposDano: string[];
  habitabilidad: string;
  riesgos: string[]; // vacío = "Ninguna de las anteriores"
  descripcion: string;
  superaDeducible?: boolean; // los respaldos anteriores a esta pregunta no lo traen
};

export function normalizarF2(crudo: Record<string, unknown>): Omit<ReporteF2, 'ref' | 'recibidoEn'> & { sinRiesgos: boolean; sitioWeb: string } {
  const lista = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.map((x) => texto(x, max)))].filter(Boolean) : []);
  return {
    reclamo: texto(crudo.reclamo, 40).toUpperCase(),
    poliza: texto(crudo.poliza, 40).toUpperCase(),
    unidad: texto(crudo.unidad, 40),
    tiposDano: lista(crudo.tiposDano, 40),
    habitabilidad: texto(crudo.habitabilidad, 20),
    riesgos: lista(crudo.riesgos, 20),
    sinRiesgos: crudo.sinRiesgos === true,
    descripcion: texto(crudo.descripcion, LARGO_MAX_DESCRIPCION_F2),
    superaDeducible: crudo.superaDeducible === 'si' ? true : crudo.superaDeducible === 'no' ? false : undefined,
    sitioWeb: texto(crudo.sitioWeb),
  };
}

// Mismas reglas que la página de Formulario 2; mensajes para mostrar al usuario.
export function validarF2(d: ReturnType<typeof normalizarF2>): string | null {
  if (!d.reclamo) return 'Escriba el número de reclamo.';
  if (!d.poliza) return 'Escriba el número de póliza.';
  if (!d.tiposDano.length || !d.tiposDano.every((t) => IDS_DANO.includes(t))) return 'Marque al menos un tipo de daño.';
  if (!HABITABILIDAD.some((h) => h.id === d.habitabilidad)) return 'Indique si se puede habitar o usar el inmueble.';
  if (d.superaDeducible === undefined) return 'Indique si los daños superan el deducible.';
  if (!d.riesgos.every((r) => RIESGOS.some((x) => x.id === r))) return 'Situación de riesgo no válida.';
  if (!d.riesgos.length && !d.sinRiesgos) return 'Indique si hay alguna situación de riesgo o marque "Ninguna de las anteriores".';
  if (d.tiposDano.includes('otro') && !d.descripcion) return 'Describa el daño que marcó como "Otro tipo de daño".';
  return null;
}

// Inserta el reporte; con la misma ref no se duplica. Devuelve el número F2-.
// Si el número de reclamo es un TRM- de esta plataforma con la misma póliza, se vincula.
export async function guardarF2(r: ReporteF2): Promise<string> {
  await asegurarTabla();
  const [fila] = await sql`
    INSERT INTO formulario2 (ref, creado_en, reclamo, poliza, unidad, tipos_dano, habitabilidad, riesgos, descripcion, supera_deducible, reclamo_id)
    VALUES (
      ${r.ref}, ${r.recibidoEn}, ${r.reclamo}, ${r.poliza}, ${r.unidad || null}, ${r.tiposDano}, ${r.habitabilidad}, ${r.riesgos},
      ${r.descripcion}, ${r.superaDeducible ?? null},
      (SELECT id FROM reclamos_terremoto
       WHERE numero = ${r.reclamo} AND upper(replace(poliza, ' ', '')) = ${r.poliza.replace(/\s+/g, '')})
    )
    ON CONFLICT (ref) DO UPDATE SET ref = EXCLUDED.ref
    RETURNING numero`;
  return fila.numero as string;
}
