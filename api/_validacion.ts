// Normalización y validación de un reporte, compartidas por el formulario
// (api/reclamos.ts) y el ingreso automático por correo (api/_ingresoCorreo.ts):
// un reporte que llega por correo cumple exactamente las mismas reglas.
import {
  EXTENSION,
  HABITABILIDAD,
  IDS_DANO,
  LARGO_MAX_DESCRIPCION,
  LARGO_MIN_DESCRIPCION,
  OPERACION,
  PROVINCIAS,
  RE_CORREO,
  RE_TELEFONO,
  RIESGOS,
  TIPOS_PROPIEDAD,
  normalizarTelefono,
} from '../shared/catalogos.js';
import { REPORTANTES } from '../shared/flujo.js';

export type Datos = {
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

export function texto(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function normalizarDatos(crudo: Record<string, unknown>): Datos {
  return {
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
}

// Cada regla: el mensaje del formulario y cómo pedir el dato por correo.
type Regla = { falla: (d: Datos) => boolean; mensaje: string; pedir: string };

const terceros = (d: Datos) => d.reportadoPor !== 'asegurado';

const REGLAS: Regla[] = [
  { falla: (d) => !REPORTANTES.some((x) => x.id === d.reportadoPor), mensaje: 'Indique quién reporta.', pedir: 'Quién reporta: el asegurado, su corredor o un ejecutivo de ASSA' },
  { falla: (d) => terceros(d) && !d.reportanteNombre, mensaje: 'Ingrese el nombre de quien reporta.', pedir: 'Su nombre completo (de quien reporta)' },
  { falla: (d) => terceros(d) && !RE_CORREO.test(d.reportanteCorreo), mensaje: 'El correo de quien reporta no es válido.', pedir: 'Su correo electrónico (de quien reporta)' },
  {
    falla: (d) => terceros(d) && !!d.reportanteTelefono && !RE_TELEFONO.test(d.reportanteTelefono),
    mensaje: 'El teléfono de quien reporta no es válido.',
    pedir: 'Un teléfono válido de quien reporta',
  },
  { falla: (d) => !d.nombre, mensaje: 'Ingrese el nombre completo del asegurado.', pedir: 'El nombre completo del asegurado' },
  { falla: (d) => !d.poliza, mensaje: 'Ingrese el número de póliza.', pedir: 'El número de póliza' },
  // Si reporta un corredor o ejecutivo, el contacto del asegurado es opcional.
  {
    falla: (d) => !(terceros(d) && !d.correo) && !RE_CORREO.test(d.correo),
    mensaje: 'El correo electrónico no es válido.',
    pedir: 'El correo electrónico del asegurado',
  },
  {
    falla: (d) => !(terceros(d) && !d.telefono) && !RE_TELEFONO.test(d.telefono),
    mensaje: 'El número de teléfono no es válido.',
    pedir: 'Un teléfono de contacto del asegurado (celular o fijo de Panamá)',
  },
  { falla: (d) => !PROVINCIAS[d.provincia]?.includes(d.distrito), mensaje: 'Seleccione provincia y distrito.', pedir: 'La provincia y el distrito donde está el inmueble' },
  { falla: (d) => !d.direccion, mensaje: 'Ingrese la dirección del inmueble.', pedir: 'La dirección del inmueble' },
  {
    falla: (d) => !(TIPOS_PROPIEDAD as readonly string[]).includes(d.tipoPropiedad),
    mensaje: 'Seleccione el tipo de inmueble.',
    pedir: 'El tipo de inmueble: vivienda, comercio o industria',
  },
  {
    falla: (d) => !d.tiposDano.length || !d.tiposDano.every((t) => IDS_DANO.includes(t)),
    mensaje: 'Seleccione al menos un tipo de daño.',
    pedir: 'Qué daños tiene el inmueble (por ejemplo: grietas, techo, vidrios, cielo raso)',
  },
  {
    falla: (d) => !HABITABILIDAD.some((h) => h.id === d.habitabilidad),
    mensaje: 'Indique si el inmueble es habitable.',
    pedir: 'Si se puede seguir viviendo o trabajando en el inmueble: sí, parcialmente o no',
  },
  { falla: (d) => !d.riesgos.every((r) => RIESGOS.some((x) => x.id === r)), mensaje: 'Situación de riesgo no válida.', pedir: 'Si hay algún riesgo: gas, electricidad, caída o agua' },
  {
    falla: (d) => !EXTENSION.some((x) => x.id === d.extension),
    mensaje: 'Indique qué tanto del inmueble está afectado.',
    pedir: 'Qué tanto del inmueble está afectado: un área, varias áreas o todo el inmueble',
  },
  {
    falla: (d) => d.tipoPropiedad !== 'Residencial' && !OPERACION.some((x) => x.id === d.operacion),
    mensaje: 'Indique si la operación está detenida.',
    pedir: 'Si la operación del negocio está detenida, funciona parcialmente o con normalidad',
  },
  {
    falla: (d) => {
      const fecha = new Date(d.fechaDano + 'T00:00:00Z');
      return Number.isNaN(fecha.getTime()) || fecha.getTime() > Date.now() + 86_400_000;
    },
    mensaje: 'La fecha del daño no es válida.',
    pedir: 'La fecha en que ocurrieron los daños',
  },
  {
    falla: (d) => d.descripcion.length < LARGO_MIN_DESCRIPCION,
    mensaje: 'Describa las afectaciones con un poco más de detalle.',
    pedir: 'Una descripción de los daños con un poco más de detalle',
  },
  {
    falla: (d) => !d.consentimiento,
    mensaje: 'Debe autorizar el uso de sus datos para tramitar el reclamo.',
    pedir: 'Su autorización para que ASSA use estos datos para tramitar el reclamo (Ley 81 de 2019): basta con responder «Autorizo»',
  },
];

// Primer problema, con el mensaje del formulario (null si el reporte está completo).
export function validar(d: Datos): string | null {
  return REGLAS.find((r) => r.falla(d))?.mensaje ?? null;
}

// Todo lo que falta, redactado para pedirlo por correo.
export function faltantes(d: Datos): string[] {
  return REGLAS.filter((r) => r.falla(d)).map((r) => r.pedir);
}

// Ajustes finales antes de guardar (iguales para el formulario y el correo).
export function prepararDatos(d: Datos): Datos {
  const listo = { ...d };
  if (listo.tipoPropiedad === 'Residencial') listo.operacion = '';
  if (listo.reportadoPor === 'asegurado') {
    listo.reportanteNombre = listo.reportanteCodigo = listo.reportanteCorreo = listo.reportanteTelefono = '';
  }
  return listo;
}
