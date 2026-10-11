import { describe, expect, it } from 'vitest';
import { IDS_DANO, PUNTOS_DANO, evaluarPrioridad, type DatosPrioridad } from '../shared/catalogos';

const base: DatosPrioridad = {
  tipoPropiedad: 'Residencial',
  habitabilidad: 'si',
  riesgos: [],
  tiposDano: ['fisuras'],
  extension: 'puntual',
  operacion: '',
};
const evaluar = (cambios: Partial<DatosPrioridad>) => evaluarPrioridad({ ...base, ...cambios });

describe('prioridad por gasto y cierre rápido', () => {
  it('todos los tipos de daño tienen puntos', () => {
    expect(IDS_DANO.filter((id) => PUNTOS_DANO[id] === undefined)).toEqual([]);
  });

  it('solo una grieta fina en residencial es cierre rápido (probablemente bajo deducible)', () => {
    expect(evaluar({})).toEqual({ prioridad: 'rapido', puntaje: 2, motivos: ['bajo_deducible'] });
  });

  it('decir "parcialmente" o "no habitable" con solo una grieta fina no sube la prioridad', () => {
    for (const habitabilidad of ['parcial', 'no']) {
      const r = evaluar({ habitabilidad });
      expect(r.prioridad).toBe('rapido');
      expect(r.motivos).toEqual(['bajo_deducible', 'habitabilidad_sin_respaldo']);
    }
  });

  it('no habitable respaldado por daños es prioridad alta', () => {
    const r = evaluar({ habitabilidad: 'no', tiposDano: ['techo'] });
    expect(r.prioridad).toBe('alta');
    expect(r.motivos).toContain('no_habitable');
  });

  it('parcialmente habitable respaldado es al menos media', () => {
    expect(evaluar({ habitabilidad: 'parcial', tiposDano: ['grietas_muros'] }).prioridad).toBe('media');
  });

  it('daño estructural siempre es alta', () => {
    for (const t of ['grietas_estructurales', 'colapso_parcial', 'asentamiento']) {
      expect(evaluar({ tiposDano: [t] }).prioridad).toBe('alta');
    }
  });

  it('los riesgos de seguridad avisan pero no cambian la prioridad', () => {
    const r = evaluar({ riesgos: ['gas', 'electrico'] });
    expect(r.prioridad).toBe('rapido');
    expect(r.motivos).toContain('riesgo_reportado');
  });

  it('el puntaje considera extensión y operación detenida', () => {
    expect(evaluar({ tiposDano: ['techo', 'cielo_raso'], extension: 'varias' })).toMatchObject({ prioridad: 'media', puntaje: 38 });
    expect(
      evaluar({ tipoPropiedad: 'Industrial', tiposDano: ['maquinaria', 'inventario'], extension: 'varias', operacion: 'detenida' }),
    ).toMatchObject({ prioridad: 'alta', puntaje: 88 });
  });

  it('cierre rápido solo aplica a residencial y sin afectar todo el inmueble', () => {
    expect(evaluar({ tipoPropiedad: 'Comercial' }).prioridad).toBe('baja');
    expect(evaluar({ extension: 'total' }).prioridad).toBe('baja');
    expect(evaluar({ tiposDano: ['fisuras', 'vidrios', 'desprendimientos'], extension: 'varias' }).prioridad).toBe('rapido');
    expect(evaluar({ tiposDano: ['contenido'] }).prioridad).toBe('baja');
  });
});
