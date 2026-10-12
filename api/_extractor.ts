// Lectura de correos: extrae de un correo en texto libre los datos que pide el
// formulario de reporte. El proveedor se elige con EXTRACTOR_PROVEEDOR:
//   - "simulado" (por defecto): reglas simples (palabras clave y patrones). No envía
//     datos a nadie; sirve para probar el flujo completo.
//   - "claude": Claude (API de Anthropic) con salida estructurada. Requiere
//     ANTHROPIC_API_KEY y que ASSA apruebe enviar el contenido de los correos a ese
//     servicio (datos personales, Ley 81 de 2019).
// El extractor solo propone datos: la validación es la misma del formulario
// (api/_validacion.ts) y lo que falte se le pide al remitente.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { EXTENSION, GRUPOS_DANO, HABITABILIDAD, IDS_DANO, OPERACION, PROVINCIAS, RIESGOS } from '../shared/catalogos.js';

export type MensajeCorreo = { de: string; deNombre: string; asunto: string; texto: string; recibidoEn: string; adjuntos: string[] };

// Datos propuestos (mismos nombres que el formulario). Vacío = el correo no lo dice.
export type Propuesta = {
  esReporteDeDanos: boolean;
  reportadoPor: '' | 'asegurado' | 'corredor' | 'ejecutivo';
  reportanteNombre: string;
  reportanteCodigo: string;
  reportanteTelefono: string;
  nombre: string;
  poliza: string;
  unidad: string;
  correo: string;
  telefono: string;
  provincia: string;
  distrito: string;
  direccion: string;
  tipoPropiedad: '' | 'Residencial' | 'Comercial' | 'Industrial';
  tiposDano: string[];
  habitabilidad: '' | 'si' | 'parcial' | 'no';
  riesgos: string[];
  extension: '' | 'puntual' | 'varias' | 'total';
  operacion: '' | 'detenida' | 'parcial' | 'normal';
  fechaDano: string;
  descripcion: string;
  consentimiento: boolean;
};

export interface ProveedorExtraccion {
  nombre: 'simulado' | 'claude';
  // `hilo`: todos los correos del remitente sobre este reporte, del más antiguo al más reciente.
  extraer(hilo: MensajeCorreo[]): Promise<Propuesta>;
}

export function proveedorExtraccion(): ProveedorExtraccion {
  return process.env.EXTRACTOR_PROVEEDOR === 'claude' ? proveedorClaude() : proveedorSimulado;
}

const VACIA: Propuesta = {
  esReporteDeDanos: false,
  reportadoPor: '',
  reportanteNombre: '',
  reportanteCodigo: '',
  reportanteTelefono: '',
  nombre: '',
  poliza: '',
  unidad: '',
  correo: '',
  telefono: '',
  provincia: '',
  distrito: '',
  direccion: '',
  tipoPropiedad: '',
  tiposDano: [],
  habitabilidad: '',
  riesgos: [],
  extension: '',
  operacion: '',
  fechaDano: '',
  descripcion: '',
  consentimiento: false,
};

// ---------------------------------------------------------------------------
// Proveedor simulado: patrones y palabras clave

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PALABRAS_DANO: [string, RegExp][] = [
  ['grietas_estructurales', /grieta[s]? en (la |las |una )?(columna|viga|losa)/],
  ['grietas_muros', /grieta[s]? (grande|abierta|profunda)|se ve (a traves|al otro lado)/],
  ['fisuras', /fisura|grieta[s]? (fina|pequena|delgada)|grietas? en (la |las )?pared/],
  ['colapso_parcial', /pared(es)? (caida|se cayo|inclinada|desplomada)|se cayo (una|la) pared/],
  ['asentamiento', /piso (hundido|desnivelado|se hundio)|se hundio/],
  ['techo', /techo|tejas?|laminas? del techo|cubierta/],
  ['cielo_raso', /cielo ?raso|gypsum|plafon/],
  ['desprendimientos', /azulejo|baldosa|enchape|ceramica/],
  ['puertas_ventanas', /(puerta|ventana)s? (que )?no (cierra|abre)/],
  ['vidrios', /vidrio|ventana rota/],
  ['instalaciones', /tuberia|cableado|tomacorriente|cables?/],
  ['tanques', /tanque|aire acondicionado|panel(es)? solar/],
  ['perimetro', /cerca|porton|muro (de colindancia|perimetral)/],
  ['contenido', /mueble|electrodomestico|televisor|nevera|refrigeradora/],
  ['maquinaria', /maquinaria|maquina/],
  ['inventario', /mercancia|inventario|mercaderia/],
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaEn(texto: string, recibido: string): string {
  const t = sinTildes(texto);
  const base = new Date(recibido);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  let m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = new RegExp(`\\b(\\d{1,2}) de (${MESES.join('|')})(?: de (\\d{4}))?`).exec(t);
  if (m) return `${m[3] ?? base.getUTCFullYear()}-${String(MESES.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/\bayer\b/.test(t)) return iso(new Date(base.getTime() - 86_400_000));
  if (/\bhoy\b/.test(t)) return iso(base);
  return '';
}

function extraerSimulado(c: MensajeCorreo): Propuesta {
  const texto = `${c.asunto}\n${c.texto}`;
  const t = sinTildes(texto);
  const p: Propuesta = { ...VACIA, tiposDano: [], riesgos: [] };
  // Consultas sobre un reporte ya hecho van a la bandeja para asociarlas, no a un reclamo nuevo.
  p.esReporteDeDanos = /sismo|terremoto|temblor|dano|grieta|reclamo|siniestro/.test(t) && !/ya report|reporte anterior|no tengo el numero|mi reclamo (numero|trm)/.test(t);
  p.poliza = /p[oó]liza\s*(?:n[°oº.]*|#|:|es la|es|numero)?\s*([A-Z0-9]{1,10}(?:-[A-Z0-9]{1,8})+|\d{5,})/i.exec(texto)?.[1]?.toUpperCase() ?? '';
  p.telefono = /(?:\+?507[\s-]?)?\b([2-9]\d{2,3}[\s-]?\d{4})\b/.exec(c.texto)?.[1]?.replace(/[\s-]/g, '') ?? '';
  p.correo = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(c.texto)?.[0]?.toLowerCase() ?? '';
  // El distrito más específico que aparece, preferido si también se nombra su provincia.
  const menciona = (x: string) => new RegExp(`(^|[^a-z])${sinTildes(x)}([^a-z]|$)`).test(t);
  const candidatos = Object.entries(PROVINCIAS)
    .flatMap(([provincia, ds]) => ds.filter(menciona).map((distrito) => ({ provincia, distrito, peso: distrito.length + (menciona(provincia) ? 100 : 0) })))
    .sort((x, y) => y.peso - x.peso);
  if (candidatos[0]) Object.assign(p, { provincia: candidatos[0].provincia, distrito: candidatos[0].distrito });
  p.direccion = /direcci[oó]n(?: es)?[:\s]+([^\n.]{4,200})/i.exec(c.texto)?.[1]?.trim() ?? '';
  p.tipoPropiedad = /fabrica|bodega|planta industrial|galera/.test(t)
    ? 'Industrial'
    : /negocio|local comercial|comercio|tienda|oficina|restaurante/.test(t)
      ? 'Comercial'
      : /casa|apartamento|vivienda|hogar|residencia/.test(t)
        ? 'Residencial'
        : '';
  p.tiposDano = PALABRAS_DANO.filter(([, re]) => re.test(t)).map(([id]) => id);
  if (p.tiposDano.includes('grietas_estructurales') || p.tiposDano.includes('grietas_muros')) p.tiposDano = p.tiposDano.filter((x) => x !== 'fisuras');
  p.habitabilidad = /no (podemos|se puede|puedo) (vivir|estar|entrar|quedarnos)|inhabitable/.test(t)
    ? 'no'
    : /no (podemos|se puede) usar (un|el|la|una)|parcialmente|una parte no/.test(t)
      ? 'parcial'
      : /(se puede|podemos) (seguir )?vivi(r|endo)|habitable|con normalidad/.test(t)
        ? 'si'
        : '';
  p.riesgos = [
    ...(/olor a gas|fuga de gas/.test(t) ? ['gas'] : []),
    ...(/chispa|corto|cables? expuesto/.test(t) ? ['electrico'] : []),
    ...(/(puede|podria) caer|a punto de caer/.test(t) ? ['caida'] : []),
    ...(/fuga de agua|inundacion|se esta mojando/.test(t) ? ['agua'] : []),
  ];
  p.extension = /toda la casa|todo el (inmueble|apartamento|local|edificio)/.test(t)
    ? 'total'
    : /varios (cuartos|ambientes|lugares)|varias (areas|partes|habitaciones|paredes)/.test(t)
      ? 'varias'
      : /solo (en )?(un|una|el|la) (cuarto|area|pared|habitacion|sala|cocina)/.test(t)
        ? 'puntual'
        : '';
  p.operacion = /cerrado|no podemos (operar|abrir|trabajar)|operacion detenida/.test(t) ? 'detenida' : /parcialmente abierto|operando a medias/.test(t) ? 'parcial' : '';
  p.fechaDano = fechaEn(c.texto, c.recibidoEn);
  p.consentimiento = /\bautorizo\b/.test(t);
  p.reportadoPor = /soy (el |la )?(corredor|corredora)|codigo de corredor/.test(t) ? 'corredor' : /ejecutivo de assa|ejecutiva de assa/.test(t) ? 'ejecutivo' : '';
  p.reportanteCodigo = /c[oó]digo(?: de corredor)?[:\s]+([A-Z0-9-]{2,20})/i.exec(c.texto)?.[1]?.toUpperCase() ?? '';
  p.nombre = /(?:[Mm]i nombre es|[Mm]e llamo|[Aa]segurad[oa](?: es)?:?)\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+){1,3})/.exec(c.texto)?.[1] ?? '';
  // El relato es el cuerpo del correo (sin la firma ni el texto citado de respuestas anteriores).
  p.descripcion = c.texto.split(/\n(?:--\s*$|>|El .* escribió:|De: )/m)[0].trim().slice(0, 3000);
  return p;
}

// Une las propuestas del hilo: lo más reciente reemplaza lo anterior, salvo vacíos.
export function combinar(base: Propuesta, nueva: Propuesta): Propuesta {
  const r: Propuesta = { ...base };
  for (const [k, v] of Object.entries(nueva) as [keyof Propuesta, Propuesta[keyof Propuesta]][]) {
    if (Array.isArray(v)) {
      (r[k] as string[]) = [...new Set([...(base[k] as string[]), ...v])];
    } else if (typeof v === 'boolean') {
      (r[k] as boolean) = (base[k] as boolean) || v;
    } else if (v) {
      (r[k] as string) = v;
    }
  }
  return r;
}

const proveedorSimulado: ProveedorExtraccion = {
  nombre: 'simulado',
  async extraer(hilo) {
    const propuestas = hilo.map(extraerSimulado);
    const r = propuestas.reduce(combinar, { ...VACIA, tiposDano: [], riesgos: [] });
    // El relato: el del primer correo que describe los daños, más lo agregado después.
    r.descripcion = propuestas
      .map((p) => p.descripcion)
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 3000);
    return r;
  },
};

// ---------------------------------------------------------------------------
// Proveedor Claude

const ESQUEMA = z.object({
  esReporteDeDanos: z.boolean(),
  reportadoPor: z.enum(['', 'asegurado', 'corredor', 'ejecutivo']),
  reportanteNombre: z.string(),
  reportanteCodigo: z.string(),
  reportanteTelefono: z.string(),
  nombre: z.string(),
  poliza: z.string(),
  unidad: z.string(),
  correo: z.string(),
  telefono: z.string(),
  provincia: z.string(),
  distrito: z.string(),
  direccion: z.string(),
  tipoPropiedad: z.enum(['', 'Residencial', 'Comercial', 'Industrial']),
  tiposDano: z.array(z.enum(IDS_DANO as [string, ...string[]])),
  habitabilidad: z.enum(['', 'si', 'parcial', 'no']),
  riesgos: z.array(z.enum(['gas', 'electrico', 'caida', 'agua'])),
  extension: z.enum(['', 'puntual', 'varias', 'total']),
  operacion: z.enum(['', 'detenida', 'parcial', 'normal']),
  fechaDano: z.string(),
  descripcion: z.string(),
  consentimiento: z.boolean(),
});

const lista = (items: readonly { id: string; titulo: string }[]) => items.map((x) => `- "${x.id}": ${x.titulo}`).join('\n');

// Fijo (sin fechas ni datos del correo) para que se pueda reutilizar en caché.
const SISTEMA = `Usted lee correos que llegan al buzón de reclamos por sismo de ASSA Compañía de Seguros (Panamá) y extrae los datos del formulario de reporte de daños.

Reglas:
- Extraiga solo lo que el correo dice o se deduce sin duda. Si un dato no aparece, déjelo vacío ("" o []): el sistema se lo pedirá al remitente. Nunca invente pólizas, teléfonos, direcciones, fechas ni nombres.
- Si hay varios correos del mismo hilo, el más reciente corrige a los anteriores.
- esReporteDeDanos: true solo si el correo reporta daños nuevos a un inmueble asegurado (normalmente por el sismo). false si es publicidad, una consulta general, otro tema, o si el remitente dice que ya reportó y escribe sobre ese reporte (pregunta por él, envía documentos o fotos): esos los asocia una persona al reclamo existente.
- reportadoPor: "asegurado" si escribe el dueño o asegurado; "corredor" si escribe su corredor de seguros; "ejecutivo" si escribe personal de ASSA. reportanteNombre/Codigo/Telefono: datos de quien escribe cuando no es el asegurado.
- nombre, correo, telefono: del asegurado. telefono: solo dígitos, de Panamá.
- provincia y distrito: exactamente como en esta lista (provincia: distritos):
${Object.entries(PROVINCIAS)
  .map(([p, ds]) => `  ${p}: ${ds.join(', ')}`)
  .join('\n')}
- tipoPropiedad: "Residencial" (casa, apartamento), "Comercial" (local, oficina, tienda) o "Industrial" (fábrica, bodega).
- tiposDano: uno o más de estos id, según lo que describe:
${GRUPOS_DANO.flatMap((g) => g.tipos.map((t) => `- "${t.id}": ${t.titulo} (${t.detalle})`)).join('\n')}
- habitabilidad:
${lista(HABITABILIDAD)}
- riesgos (solo si se mencionan):
${lista(RIESGOS)}
- extension:
${lista(EXTENSION)}
- operacion (solo comercial o industrial):
${lista(OPERACION)}
- fechaDano: AAAA-MM-DD. Interprete "ayer", "el sábado", etc. con la fecha de recepción del correo.
- descripcion: el relato de los daños con las palabras del remitente, sin saludos ni firma.
- consentimiento: true solo si el remitente autoriza expresamente el uso de sus datos para tramitar el reclamo (por ejemplo, responde "Autorizo").`;

function proveedorClaude(): ProveedorExtraccion {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY para EXTRACTOR_PROVEEDOR=claude');
  const cliente = new Anthropic();
  return {
    nombre: 'claude',
    async extraer(hilo) {
      const correos = hilo
        .map(
          (c, i) =>
            `<correo numero="${i + 1}" recibido="${c.recibidoEn}">\nDe: ${c.deNombre} <${c.de}>\nAsunto: ${c.asunto}\n` +
            (c.adjuntos.length ? `Adjuntos: ${c.adjuntos.join(', ')}\n` : '') +
            `\n${c.texto}\n</correo>`,
        )
        .join('\n\n');
      const respuesta = await cliente.beta.messages.parse({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        // Si el modelo declina por sus salvaguardas, la API reintenta con otro modelo.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(ESQUEMA) },
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Extraiga los datos del reporte de estos correos:\n\n${correos}` }],
      });
      if (respuesta.stop_reason === 'refusal' || !respuesta.parsed_output) {
        throw new Error(`La extracción no devolvió datos (${respuesta.stop_reason})`);
      }
      const r = respuesta.parsed_output;
      return { ...r, tiposDano: r.tiposDano.filter((x) => IDS_DANO.includes(x)) };
    },
  };
}
