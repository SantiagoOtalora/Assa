// Catálogos del flujo de gestión de reclamos (panel y API).

export const ESTADOS = [
  { id: 'recibido', titulo: 'Recibido', abierto: true },
  { id: 'en_revision', titulo: 'En revisión', abierto: true },
  { id: 'pendiente_asegurado', titulo: 'Esperando al asegurado', abierto: true },
  { id: 'inspeccion_programada', titulo: 'Inspección programada', abierto: true },
  { id: 'inspeccionado', titulo: 'Inspeccionado', abierto: true },
  { id: 'en_ajuste', titulo: 'En ajuste', abierto: true },
  { id: 'cerrado', titulo: 'Cerrado', abierto: false },
] as const;

export const MOTIVOS_CIERRE = [
  { id: 'indemnizado', titulo: 'Indemnizado' },
  { id: 'bajo_deducible', titulo: 'No supera el deducible' },
  { id: 'sin_cobertura', titulo: 'Sin cobertura' },
  { id: 'duplicado', titulo: 'Duplicado' },
  { id: 'desistido', titulo: 'Desistido por el asegurado' },
  { id: 'otro', titulo: 'Otro' },
] as const;

export const CANALES = [
  { id: 'llamada', titulo: 'Llamada' },
  { id: 'whatsapp', titulo: 'WhatsApp' },
  { id: 'correo', titulo: 'Correo' },
  { id: 'sms', titulo: 'SMS' },
] as const;

export const RESULTADOS_CONTACTO = [
  { id: 'contactado', titulo: 'Contactado' },
  { id: 'mensaje_enviado', titulo: 'Mensaje enviado' },
  { id: 'no_contesta', titulo: 'No contesta' },
  { id: 'dato_incorrecto', titulo: 'Teléfono o correo incorrecto' },
  { id: 'respuesta_recibida', titulo: 'Respuesta del asegurado' },
] as const;

export const TIPOS_EVENTO = ['estado', 'asignacion', 'nota', 'comunicacion'] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const tituloDe = (lista: readonly { id: string; titulo: string }[], id: string | null | undefined) =>
  lista.find((x) => x.id === id)?.titulo ?? id ?? '';

export const esAbierto = (estado: string) => ESTADOS.find((e) => e.id === estado)?.abierto ?? true;

// Plantillas de mensaje para el equipo de canales. {variables} se reemplazan
// con los datos del caso; el texto se puede editar antes de enviarlo.
export const PLANTILLAS = [
  {
    id: 'recepcion',
    titulo: 'Confirmación de recepción',
    asunto: 'ASSA · Recibimos su reporte {numero}',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA Compañía de Seguros. Recibimos su reporte {numero} por daños del sismo en su inmueble de {ubicacion}. Estamos revisando la información y le indicaremos los siguientes pasos.',
  },
  {
    id: 'inspeccion',
    titulo: 'Inspección programada',
    asunto: 'ASSA · Inspección de su reporte {numero}',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA. Programamos la inspección de su inmueble (reporte {numero}) para el {fecha_inspeccion}. Por favor confírmenos si la fecha le funciona y que habrá alguien en el lugar.',
  },
  {
    id: 'documentos',
    titulo: 'Solicitud de información',
    asunto: 'ASSA · Información pendiente de su reporte {numero}',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA. Para continuar con su reporte {numero} necesitamos lo siguiente: [detalle]. Puede responder a este mensaje con la información.',
  },
  {
    id: 'bajo_deducible',
    titulo: 'No supera el deducible',
    asunto: 'ASSA · Resultado de su reporte {numero}',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA. Revisamos su reporte {numero}. Según la evaluación, el costo de los daños no supera el deducible de su póliza para terremoto (2 % de la suma asegurada), por lo que no corresponde una indemnización. Si tiene dudas, con gusto le atendemos o puede consultar a su corredor.',
  },
  {
    id: 'cierre',
    titulo: 'Cierre del caso',
    asunto: 'ASSA · Cierre de su reporte {numero}',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA. Le informamos que su reporte {numero} fue cerrado. Gracias por su confianza.',
  },
] as const;

export function llenarPlantilla(texto: string, valores: Record<string, string>) {
  return texto.replace(/\{(\w+)\}/g, (todo, clave) => valores[clave] || todo);
}
