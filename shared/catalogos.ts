// Catálogos compartidos entre el formulario (src/) y la API (api/).

export const PROVINCIAS: Record<string, string[]> = {
  'Bocas del Toro': ['Almirante', 'Bocas del Toro', 'Changuinola', 'Chiriquí Grande'],
  'Chiriquí': [
    'Alanje', 'Barú', 'Boquerón', 'Boquete', 'Bugaba', 'David', 'Dolega', 'Gualaca',
    'Remedios', 'Renacimiento', 'San Félix', 'San Lorenzo', 'Tierras Altas', 'Tolé',
  ],
  'Coclé': ['Aguadulce', 'Antón', 'La Pintada', 'Natá', 'Olá', 'Penonomé'],
  'Colón': ['Chagres', 'Colón', 'Donoso', 'Omar Torrijos Herrera', 'Portobelo', 'Santa Isabel'],
  'Darién': ['Chepigana', 'Pinogana', 'Santa Fe'],
  'Herrera': ['Chitré', 'Las Minas', 'Los Pozos', 'Ocú', 'Parita', 'Pesé', 'Santa María'],
  'Los Santos': ['Guararé', 'Las Tablas', 'Los Santos', 'Macaracas', 'Pedasí', 'Pocrí', 'Tonosí'],
  'Panamá': ['Balboa', 'Chepo', 'Chimán', 'Panamá', 'San Miguelito', 'Taboga'],
  'Panamá Oeste': ['Arraiján', 'Capira', 'Chame', 'La Chorrera', 'San Carlos'],
  'Veraguas': [
    'Atalaya', 'Calobre', 'Cañazas', 'La Mesa', 'Las Palmas', 'Mariato', 'Montijo',
    'Río de Jesús', 'San Francisco', 'Santa Fe', 'Santiago', 'Soná',
  ],
  'Comarca Emberá-Wounaan': ['Cémaco', 'Sambú'],
  'Comarca Guna Yala': ['Guna Yala'],
  'Comarca Naso Tjër Di': ['Naso Tjër Di'],
  'Comarca Ngäbe-Buglé': [
    'Besikó', 'Jirondai', 'Kankintú', 'Kusapín', 'Mironó', 'Müna', 'Nole Duima', 'Ñürüm',
    'Santa Catalina o Calovébora',
  ],
};

export type TipoDano = { id: string; titulo: string; detalle: string };

export const GRUPOS_DANO: { grupo: string; tipos: TipoDano[] }[] = [
  // Cada opción describe un solo elemento, para que no se confundan entre sí.
  // Los id no cambian: las reglas de prioridad y los reportes guardados los usan.
  {
    grupo: 'Grietas',
    tipos: [
      { id: 'fisuras', titulo: 'Grietas finas en paredes', detalle: 'Delgadas como un cabello; solo en la pintura o el repello' },
      { id: 'grietas_muros', titulo: 'Grietas abiertas en paredes', detalle: 'Cabe una moneda o se ve a través de la pared' },
      { id: 'grietas_estructurales', titulo: 'Grietas en columnas, vigas o losas', detalle: 'En los elementos que sostienen la construcción' },
    ],
  },
  {
    grupo: 'Estructura',
    tipos: [
      { id: 'colapso_parcial', titulo: 'Paredes caídas o inclinadas', detalle: 'Dentro de la construcción; se cayeron o se ven desplomadas' },
      { id: 'asentamiento', titulo: 'Pisos hundidos o desnivelados', detalle: 'El piso o la base de la construcción se hundió o se inclinó' },
    ],
  },
  {
    grupo: 'Techo y acabados',
    tipos: [
      { id: 'techo', titulo: 'Techo o cubierta', detalle: 'Tejas o láminas movidas, rotas o con filtraciones' },
      { id: 'cielo_raso', titulo: 'Cielo raso', detalle: 'Gypsum, plafones o losetas caídas o colgando' },
      { id: 'desprendimientos', titulo: 'Azulejos, baldosas o enchapes caídos', detalle: 'Piezas que se soltaron de paredes, pisos o fachada' },
    ],
  },
  {
    grupo: 'Puertas y ventanas',
    tipos: [
      { id: 'puertas_ventanas', titulo: 'Puertas o ventanas que no cierran', detalle: 'El marco se deformó; se traban o no cierran bien' },
      { id: 'vidrios', titulo: 'Vidrios rotos', detalle: 'Solo el vidrio; el marco está bien' },
    ],
  },
  {
    grupo: 'Instalaciones y exteriores',
    tipos: [
      { id: 'instalaciones', titulo: 'Tuberías o cableado', detalle: 'Tuberías rotas, cables o tomacorrientes dañados' },
      { id: 'tanques', titulo: 'Tanques, aires acondicionados o paneles solares', detalle: 'Equipos instalados en el techo o en el exterior' },
      { id: 'perimetro', titulo: 'Cercas, portones o muros de colindancia', detalle: 'Fuera de la construcción principal' },
    ],
  },
  {
    grupo: 'Contenido',
    tipos: [
      { id: 'contenido', titulo: 'Muebles y electrodomésticos', detalle: 'Muebles, estanterías, electrodomésticos y artículos personales' },
      { id: 'maquinaria', titulo: 'Maquinaria del negocio', detalle: 'Equipos de producción o de trabajo de la empresa' },
      { id: 'inventario', titulo: 'Mercancía o inventario', detalle: 'Productos para la venta o materia prima' },
    ],
  },
  {
    grupo: 'Otro',
    tipos: [{ id: 'otro', titulo: 'Otro tipo de daño', detalle: 'Descríbalo en el relato' }],
  },
];

export const IDS_DANO = GRUPOS_DANO.flatMap((g) => g.tipos.map((t) => t.id));

export const TIPOS_PROPIEDAD = ['Residencial', 'Comercial', 'Industrial'] as const;

export const HABITABILIDAD = [
  { id: 'si', titulo: 'Sí, se puede vivir o trabajar con normalidad' },
  { id: 'parcial', titulo: 'Parcialmente: al menos un área no se puede usar por los daños' },
  { id: 'no', titulo: 'No: no se puede vivir ni trabajar ahí por los daños' },
] as const;

export const RIESGOS = [
  { id: 'gas', titulo: 'Olor a gas o fuga de gas' },
  { id: 'electrico', titulo: 'Cables expuestos, chispas o cortos eléctricos' },
  { id: 'caida', titulo: 'Paredes, techo o fachada que pueden caer' },
  { id: 'agua', titulo: 'Fuga de agua o inundación' },
] as const;

export const EXTENSION = [
  { id: 'puntual', titulo: 'Un área puntual' },
  { id: 'varias', titulo: 'Varias áreas' },
  { id: 'total', titulo: 'Todo el inmueble' },
] as const;

export const OPERACION = [
  { id: 'detenida', titulo: 'Sí, está detenida' },
  { id: 'parcial', titulo: 'Funciona parcialmente' },
  { id: 'normal', titulo: 'No, funciona con normalidad' },
] as const;

// ---------------------------------------------------------------------------
// Prioridad del reporte para ASSA: costo estimado y urgencia de resolver,
// no el riesgo personal del asegurado (eso solo genera avisos de seguridad).

export type Prioridad = 'alta' | 'media' | 'baja' | 'rapido';

export const NOMBRE_PRIORIDAD: Record<Prioridad, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  rapido: 'Cierre rápido',
};

export type DatosPrioridad = {
  tipoPropiedad: string;
  habitabilidad: string;
  riesgos: string[];
  tiposDano: string[];
  extension: string;
  operacion: string;
};

// Costo de reparación estimado, como % de la suma asegurada del inmueble, para
// un daño en un área. Referencia: vivienda de unos B/.150,000 en Panamá
// (mano de obra y materiales locales). En inmuebles de menor valor el % real
// es mayor; con la suma asegurada de la póliza se podrá calcular exacto.
export const COSTO_DANO: Record<string, number> = {
  fisuras: 0.2, //           resanar repello y pintar: B/.200–400
  vidrios: 0.3, //           reponer vidrios: B/.150–600
  puertas_ventanas: 0.6, //  ajustar o cambiar marcos: B/.400–1,500
  cielo_raso: 0.7, //        gypsum o plafones: B/.500–1,500
  desprendimientos: 0.8, //  azulejos, baldosas o enchapes: B/.500–2,000
  grietas_muros: 1, //       abrir, reforzar con malla, repellar y pintar: B/.800–2,500
  contenido: 1, //           muebles y electrodomésticos: B/.500–3,000
  otro: 1,
  instalaciones: 1.2, //     abrir paredes, reparar tuberías o cableado: B/.800–3,000
  tanques: 1.5, //           tanques, aires acondicionados, paneles: B/.800–4,000
  perimetro: 2, //           cercas, portones o muros de colindancia: B/.1,000–5,000
  techo: 2.5, //             reponer láminas o tejas, impermeabilizar: B/.1,500–6,000
  inventario: 3, //          mercancía (comercial e industrial)
  maquinaria: 5, //          equipos del negocio
  colapso_parcial: 6, //     reconstruir paredes: B/.3,000–15,000
  grietas_estructurales: 8, // refuerzo de columnas, vigas o losas + ingeniero: B/.5,000–20,000
  asentamiento: 12, //       recimentación o nivelación: B/.10,000–40,000
};
// El costo crece con la cantidad de áreas afectadas.
export const FACTOR_EXTENSION: Record<string, number> = { puntual: 1, varias: 2, total: 3.5 };
// Comercial e industrial: la operación detenida agrega costo (interrupción de negocio).
export const COSTO_OPERACION: Record<string, number> = { detenida: 5, parcial: 2 };
// Deducible de terremoto residencial: 2 % de la suma asegurada.
export const DEDUCIBLE = 2;
export const UMBRAL_ALTA = 8;

const DANOS_ESTRUCTURALES = ['grietas_estructurales', 'colapso_parcial', 'asentamiento'];
// Daños que respaldan que el inmueble no se puede usar.
const RESPALDAN_NO_HABITABLE = [...DANOS_ESTRUCTURALES, 'techo'];
const RESPALDAN_PARCIAL = [...RESPALDAN_NO_HABITABLE, 'grietas_muros', 'cielo_raso', 'instalaciones'];

export type NivelRegla = Prioridad | 'aviso';

export type ReglaPrioridad = {
  id: string;
  nivel: NivelRegla;
  titulo: string;
  corto: string;
};

// Orden de evaluación: alta > media > cierre rápido > baja. Los "aviso" no
// cambian la prioridad; solo informan al equipo.
export const REGLAS_PRIORIDAD: ReglaPrioridad[] = [
  { id: 'dano_estructural', corto: 'Daño estructural', nivel: 'alta', titulo: 'Daño estructural: grietas en columnas, vigas o losas, paredes caídas o pisos hundidos' },
  { id: 'no_habitable', corto: 'No habitable', nivel: 'alta', titulo: 'No habitable, respaldado por los daños reportados' },
  { id: 'gasto_alto', corto: 'Costo alto', nivel: 'alta', titulo: `Gasto estimado alto: ${UMBRAL_ALTA} % o más de la suma asegurada` },
  { id: 'parcial_habitable', corto: 'Parcialmente habitable', nivel: 'media', titulo: 'Parcialmente habitable, respaldado por los daños reportados' },
  { id: 'gasto_medio', corto: 'Supera deducible', nivel: 'media', titulo: `Probablemente supera el deducible: gasto estimado de ${DEDUCIBLE} % a ${UMBRAL_ALTA} % de la suma asegurada` },
  {
    id: 'bajo_deducible',
    corto: 'Bajo deducible',
    nivel: 'rapido',
    titulo: `Residencial con gasto estimado menor al ${DEDUCIBLE} %: probablemente no supera el deducible`,
  },
  { id: 'habitabilidad_sin_respaldo', corto: 'Habitabilidad sin respaldo', nivel: 'aviso', titulo: 'Declaró que no es habitable o solo parcialmente, sin daños que lo respalden' },
  { id: 'riesgo_reportado', corto: 'Riesgo reportado', nivel: 'aviso', titulo: 'Reportó un riesgo de seguridad (gas, electricidad, caída o agua)' },
];

// Costo de reparación estimado, en % de la suma asegurada (un decimal).
export function costoEstimado(d: DatosPrioridad): number {
  const danos = d.tiposDano.reduce((suma, t) => suma + (COSTO_DANO[t] ?? 0), 0);
  const operacion = d.tipoPropiedad !== 'Residencial' ? (COSTO_OPERACION[d.operacion] ?? 0) : 0;
  return Math.round((danos * (FACTOR_EXTENSION[d.extension] ?? 1) + operacion) * 10) / 10;
}

export function evaluarPrioridad(d: DatosPrioridad): { prioridad: Prioridad; costo: number; motivos: string[] } {
  const costo = costoEstimado(d);
  const motivos: string[] = [];
  const tiene = (lista: string[]) => d.tiposDano.some((t) => lista.includes(t));

  if (tiene(DANOS_ESTRUCTURALES)) motivos.push('dano_estructural');
  const noHabitable = d.habitabilidad === 'no' && (tiene(RESPALDAN_NO_HABITABLE) || d.extension === 'total');
  const parcial = d.habitabilidad === 'parcial' && tiene(RESPALDAN_PARCIAL);
  if (noHabitable) motivos.push('no_habitable');
  if (costo >= UMBRAL_ALTA) motivos.push('gasto_alto');
  if (parcial) motivos.push('parcial_habitable');
  if (costo >= DEDUCIBLE && costo < UMBRAL_ALTA) motivos.push('gasto_medio');
  if (d.tipoPropiedad === 'Residencial' && costo < DEDUCIBLE && !motivos.length) motivos.push('bajo_deducible');

  if (d.habitabilidad !== 'si' && !noHabitable && !parcial) motivos.push('habitabilidad_sin_respaldo');
  if (d.riesgos.length) motivos.push('riesgo_reportado');

  const nivel = (id: string) => REGLAS_PRIORIDAD.find((r) => r.id === id)!.nivel;
  const niveles = motivos.map(nivel);
  const prioridad: Prioridad = niveles.includes('alta')
    ? 'alta'
    : niveles.includes('media')
      ? 'media'
      : niveles.includes('rapido')
        ? 'rapido'
        : 'baja';
  return { prioridad, costo, motivos };
}

export function calcularPrioridad(d: DatosPrioridad): Prioridad {
  return evaluarPrioridad(d).prioridad;
}

export const MAX_FOTOS = 5;
export const MAX_BYTES_FOTO = 1_000_000;
export const LARGO_MIN_DESCRIPCION = 20;
export const LARGO_MAX_DESCRIPCION = 3000;

export const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Panamá: 7 dígitos (fijo) u 8 dígitos (celular), con +507 opcional.
export const RE_TELEFONO = /^(\+?507)?[2-9]\d{6,7}$/;

export function normalizarTelefono(valor: string) {
  return valor.replace(/[\s()-]/g, '');
}
