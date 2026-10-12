// Catálogos del flujo de gestión de reclamos (panel y API).

// Fases del reclamo. Los id antiguos (primera versión del flujo) se migran en
// la base de datos y se muestran con su equivalente en el historial.
export const ESTADOS = [
  { id: 'ingresado', titulo: 'Ingresado', abierto: true },
  { id: 'esperando_info', titulo: 'Esperando información completa', abierto: true },
  { id: 'en_analisis', titulo: 'En análisis', abierto: true },
  { id: 'con_ajustador', titulo: 'Con analista o ajustador', abierto: true },
  { id: 'pagado', titulo: 'Pagado', abierto: false },
  { id: 'declinado', titulo: 'Declinado', abierto: false },
] as const;

export const ESTADOS_ANTIGUOS: Record<string, string> = {
  recibido: 'ingresado',
  en_revision: 'en_analisis',
  pendiente_asegurado: 'esperando_info',
  inspeccion_programada: 'con_ajustador',
  inspeccionado: 'con_ajustador',
  en_ajuste: 'con_ajustador',
};

export const MOTIVOS_DECLINACION = [
  { id: 'bajo_deducible', titulo: 'No supera el deducible' },
  { id: 'sin_cobertura', titulo: 'Sin cobertura' },
  { id: 'exclusion', titulo: 'Exclusión de la póliza' },
  { id: 'preexistente', titulo: 'Daño preexistente o no relacionado al sismo' },
  { id: 'poliza_no_vigente', titulo: 'Póliza no vigente' },
  { id: 'desistido', titulo: 'Desistido por el asegurado' },
  { id: 'duplicado', titulo: 'Duplicado' },
  { id: 'otro', titulo: 'Otro' },
] as const;
// Motivos de la primera versión del flujo, para mostrar el historial.
const MOTIVOS_ANTIGUOS = [{ id: 'indemnizado', titulo: 'Indemnizado' }];
export const TODOS_LOS_MOTIVOS = [...MOTIVOS_DECLINACION, ...MOTIVOS_ANTIGUOS];

// Quién ingresa el reclamo.
export const REPORTANTES = [
  { id: 'asegurado', titulo: 'Asegurado' },
  { id: 'corredor', titulo: 'Corredor' },
  { id: 'ejecutivo', titulo: 'Ejecutivo de ASSA' },
] as const;

// Por dónde entró el reclamo.
export const CANALES_INGRESO = [
  { id: 'formulario', titulo: 'Formulario web' },
  { id: 'correo', titulo: 'Correo' },
] as const;

// Coberturas que el analista marca como afectadas, con sus montos.
export const COBERTURAS = [
  { id: 'edificio', titulo: 'Edificio o estructura' },
  { id: 'contenido', titulo: 'Contenido' },
  { id: 'maquinaria', titulo: 'Maquinaria y equipo' },
  { id: 'mercancia', titulo: 'Mercancía o inventario' },
  { id: 'interrupcion', titulo: 'Interrupción de negocio o pérdida de rentas' },
  { id: 'remocion', titulo: 'Remoción de escombros' },
  { id: 'gastos_extra', titulo: 'Gastos extraordinarios' },
  { id: 'vidrios', titulo: 'Rotura de vidrios' },
  { id: 'rc', titulo: 'Responsabilidad civil' },
  { id: 'otra', titulo: 'Otra cobertura' },
] as const;

export const CAUSAS = [
  { id: 'sismo', titulo: 'Sismo: daño directo por el movimiento' },
  { id: 'incendio', titulo: 'Incendio a consecuencia del sismo' },
  { id: 'agua', titulo: 'Daño por agua a consecuencia del sismo' },
  { id: 'terreno', titulo: 'Deslizamiento o hundimiento del terreno' },
  { id: 'robo', titulo: 'Robo o saqueo posterior al sismo' },
  { id: 'otra', titulo: 'Otra causa' },
] as const;

export type CoberturaAfectada = { id: string; reclamado: number; reserva: number; pagado: number };

export const TIPOS_DOCUMENTO = [
  { id: 'poliza', titulo: 'Póliza o certificado' },
  { id: 'identificacion', titulo: 'Identificación del asegurado' },
  { id: 'presupuesto', titulo: 'Presupuesto o cotización' },
  { id: 'informe_ajuste', titulo: 'Informe de ajuste o inspección' },
  { id: 'fotos', titulo: 'Fotos adicionales' },
  { id: 'correo', titulo: 'Correo (enviado o recibido)' },
  { id: 'finiquito', titulo: 'Finiquito o comprobante de pago' },
  { id: 'otro', titulo: 'Otro' },
] as const;

export const MAX_BYTES_DOCUMENTO = 25 * 1024 * 1024;
export const TIPOS_ARCHIVO_DOCUMENTO = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-outlook',
  'message/rfc822',
  'text/plain',
];

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

export const TIPOS_EVENTO = ['estado', 'asignacion', 'nota', 'comunicacion', 'analisis', 'documento'] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const tituloDe = (lista: readonly { id: string; titulo: string }[], id: string | null | undefined) =>
  lista.find((x) => x.id === id)?.titulo ?? id ?? '';

export const normalizarEstado = (estado: string) => ESTADOS_ANTIGUOS[estado] ?? (estado === 'cerrado' ? 'declinado' : estado);
export const esAbierto = (estado: string) => ESTADOS.find((e) => e.id === normalizarEstado(estado))?.abierto ?? true;
export const tituloEstado = (estado: string) => tituloDe(ESTADOS, normalizarEstado(estado));

// Plantillas de mensaje para el equipo de canales. {variables} se reemplazan
// con los datos del caso; el texto se puede editar antes de enviarlo.
export const PLANTILLAS = [
  {
    id: 'recepcion',
    titulo: 'Confirmación de recepción',
    asunto: 'ASSA · Recibimos su reporte {numero}',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA Compañía de Seguros. Recibimos su reporte {numero} por daños del sismo en su inmueble de {ubicacion}. Estamos revisando la información y le indicaremos los siguientes pasos. Puede consultar en qué fase está en assa-terremoto.vercel.app/consulta.',
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
    id: 'en_analisis',
    titulo: 'Reclamo en análisis',
    asunto: 'ASSA · Su reclamo {numero} está en análisis',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA. Le informamos que su reclamo {numero} por daños en {ubicacion} pasó a análisis: estamos revisando la información y la cobertura de su póliza. Le avisaremos los siguientes pasos. Puede consultar en qué fase está en assa-terremoto.vercel.app/consulta.',
  },
  {
    id: 'ajustador',
    titulo: 'Asignado a un ajustador',
    asunto: 'ASSA · Su reclamo {numero} fue asignado a un ajustador',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA. Su reclamo {numero} fue asignado a un ajustador, que se comunicará con usted para coordinar la inspección del inmueble en {ubicacion}.',
  },
  {
    id: 'bajo_deducible',
    titulo: 'No supera el deducible',
    asunto: 'ASSA · Resultado de su reporte {numero}',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA. Revisamos su reporte {numero}. Según la evaluación, el costo de los daños no supera el deducible de su póliza para terremoto (2 % de la suma asegurada), por lo que no corresponde una indemnización. Si tiene dudas, con gusto le atendemos o puede consultar a su corredor.',
  },
  {
    id: 'pago',
    titulo: 'Pago procesado',
    asunto: 'ASSA · Pago de su reclamo {numero}',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA. Le informamos que su reclamo {numero} fue aprobado y el pago fue procesado. Gracias por su confianza.',
  },
  {
    id: 'declinacion',
    titulo: 'Reclamo declinado',
    asunto: 'ASSA · Resultado de su reclamo {numero}',
    texto:
      'Hola, {nombre}. Le saluda {operador} de ASSA. Revisamos su reclamo {numero} y lamentamos informarle que no procede por el siguiente motivo: [motivo]. Si tiene dudas, con gusto le atendemos o puede consultar a su corredor.',
  },
] as const;

export function llenarPlantilla(texto: string, valores: Record<string, string>) {
  return texto.replace(/\{(\w+)\}/g, (todo, clave) => valores[clave] || todo);
}

const fmtDiaPlantilla = new Intl.DateTimeFormat('es-PA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

// Valores de las {variables} de las plantillas para un caso y un destinatario.
export function valoresPlantilla(
  caso: { numero: string; distrito: string; provincia: string; fechaInspeccion: string | null },
  nombreDestinatario: string,
  operador: string,
): Record<string, string> {
  return {
    nombre: nombreDestinatario.split(/\s+/)[0] ?? '',
    numero: caso.numero,
    operador: operador || 'el equipo de reclamos',
    ubicacion: `${caso.distrito}, ${caso.provincia}`,
    fecha_inspeccion: caso.fechaInspeccion ? fmtDiaPlantilla.format(new Date(caso.fechaInspeccion)) : '[fecha]',
  };
}

// Aviso automático por correo al cambiar de fase (o al fijar la fecha de inspección).
// Declinado y "esperando información" no se avisan solos: necesitan un mensaje
// redactado por una persona (motivo, qué información falta).
export function avisoDeFase(estado: string, fechaInspeccion: string | null): (typeof PLANTILLAS)[number]['id'] | null {
  if (estado === 'en_analisis') return 'en_analisis';
  if (estado === 'con_ajustador') return fechaInspeccion ? 'inspeccion' : 'ajustador';
  if (estado === 'pagado') return 'pago';
  return null;
}
