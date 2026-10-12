// Avisos automáticos por correo al asegurado (y a quien reportó, si fue un
// corredor o ejecutivo) cuando el caso cambia de fase. Se envían después de
// guardar el cambio: si el correo falla, la fase queda guardada igual y el
// panel lo informa. Cada aviso enviado queda en el historial del caso.
import { RE_CORREO } from '../shared/catalogos.js';
import { PLANTILLAS, avisoDeFase, llenarPlantilla, valoresPlantilla } from '../shared/flujo.js';
import { proveedorCorreo } from './_correo.js';
import { sql } from './_db.js';

export type ResultadoAviso = { plantilla: string | null; enviados: string[]; fallidos: string[] };

export async function avisarCambioDeFase(reclamoId: number, autor: string): Promise<ResultadoAviso> {
  const [c] = await sql`
    SELECT numero, estado, nombre, correo, distrito, provincia, fecha_inspeccion::text AS fecha_inspeccion,
           reportado_por, reportante_nombre, reportante_correo
    FROM reclamos_terremoto WHERE id = ${reclamoId}`;
  const id = c ? avisoDeFase(c.estado, c.fecha_inspeccion) : null;
  const plantilla = PLANTILLAS.find((p) => p.id === id);
  if (!c || !plantilla) return { plantilla: null, enviados: [], fallidos: [] };

  const destinatarios = [
    { nombre: c.nombre as string, correo: (c.correo ?? '') as string, tercero: false },
    ...(c.reportado_por !== 'asegurado' ? [{ nombre: (c.reportante_nombre ?? '') as string, correo: (c.reportante_correo ?? '') as string, tercero: true }] : []),
  ].filter((d, i, todos) => RE_CORREO.test(d.correo) && todos.findIndex((x) => x.correo.toLowerCase() === d.correo.toLowerCase()) === i);

  const caso = { numero: c.numero, distrito: c.distrito, provincia: c.provincia, fechaInspeccion: c.fecha_inspeccion };
  const proveedor = proveedorCorreo();
  const resultado: ResultadoAviso = { plantilla: plantilla.id, enviados: [], fallidos: [] };
  for (const d of destinatarios) {
    const valores = valoresPlantilla(caso, d.nombre, autor);
    const asunto = llenarPlantilla(plantilla.asunto, valores);
    const texto = llenarPlantilla(plantilla.texto, valores);
    try {
      await proveedor.enviar({ para: d.correo, nombre: d.nombre, asunto, texto });
    } catch (e) {
      console.error('No se pudo enviar el aviso de cambio de fase', reclamoId, d.correo, e);
      resultado.fallidos.push(d.correo);
      continue;
    }
    const datos = {
      canal: 'correo',
      resultado: 'mensaje_enviado',
      direccion: 'saliente',
      envio: proveedor.nombre,
      para: d.correo,
      asunto,
      texto,
      plantilla: plantilla.id,
      automatico: true,
      aviso: 'fase',
      ...(d.tercero && { destinatario: d.nombre }),
    };
    await sql`
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      VALUES (${reclamoId}, ${autor}, 'comunicacion', ${JSON.stringify(datos)}::jsonb)`;
    resultado.enviados.push(d.correo);
  }
  return resultado;
}
