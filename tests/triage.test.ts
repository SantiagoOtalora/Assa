import { describe, expect, it } from 'vitest';
import { IDS_DANO, evaluarTriage } from '../shared/catalogos';

// La primera versión de la regla, para comprobar que las reglas con nombre clasifican igual.
function reglaOriginal(d: { habitabilidad: string; riesgos: string[]; tiposDano: string[]; extension: string; operacion: string }) {
  const graves = ['grietas_estructurales', 'colapso_parcial', 'asentamiento'];
  const moderados = ['techo', 'cielo_raso', 'puertas_ventanas', 'instalaciones', 'tanques', 'perimetro', 'maquinaria'];
  if (d.habitabilidad === 'no' || d.riesgos.some((r) => r !== 'agua') || d.tiposDano.some((t) => graves.includes(t))) return 'alta';
  if (
    d.habitabilidad === 'parcial' ||
    d.riesgos.includes('agua') ||
    d.extension === 'total' ||
    d.operacion === 'detenida' ||
    d.tiposDano.some((t) => moderados.includes(t))
  )
    return 'media';
  return 'baja';
}

describe('reglas de triage', () => {
  it('clasifican igual que la regla original en todas las combinaciones', () => {
    const riesgos = [[], ['gas'], ['electrico'], ['caida'], ['agua'], ['agua', 'gas']];
    let casos = 0;
    for (const habitabilidad of ['si', 'parcial', 'no'])
      for (const r of riesgos)
        for (const dano of IDS_DANO)
          for (const extension of ['puntual', 'varias', 'total'])
            for (const operacion of ['', 'detenida', 'parcial', 'normal']) {
              const d = { habitabilidad, riesgos: r, tiposDano: [dano], extension, operacion };
              expect(evaluarTriage(d).prioridad).toBe(reglaOriginal(d));
              casos++;
            }
    expect(casos).toBeGreaterThan(3000);
  });

  it('explica el motivo', () => {
    expect(evaluarTriage({ habitabilidad: 'si', riesgos: [], tiposDano: ['fisuras'], extension: 'puntual', operacion: '' })).toEqual({
      prioridad: 'baja',
      motivos: [],
    });
    expect(evaluarTriage({ habitabilidad: 'parcial', riesgos: ['gas'], tiposDano: ['techo'], extension: 'total', operacion: '' })).toEqual({
      prioridad: 'alta',
      motivos: ['gas', 'habitable_parcial', 'todo_inmueble', 'dano_moderado'],
    });
  });
});
