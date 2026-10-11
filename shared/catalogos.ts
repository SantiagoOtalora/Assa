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

// Puntos de gasto estimado por tipo de daño (ajustables).
export const PUNTOS_DANO: Record<string, number> = {
  fisuras: 2,
  grietas_muros: 10,
  grietas_estructurales: 40,
  colapso_parcial: 50,
  asentamiento: 40,
  techo: 15,
  cielo_raso: 10,
  desprendimientos: 5,
  puertas_ventanas: 6,
  vidrios: 3,
  instalaciones: 12,
  tanques: 8,
  perimetro: 8,
  contenido: 8,
  maquinaria: 25,
  inventario: 20,
  otro: 5,
};
export const FACTOR_EXTENSION: Record<string, number> = { puntual: 1, varias: 1.5, total: 2 };
export const PUNTOS_OPERACION: Record<string, number> = { detenida: 20, parcial: 10 };
export const UMBRAL_ALTA = 50;
export const UMBRAL_MEDIA = 15;

const DANOS_ESTRUCTURALES = ['grietas_estructurales', 'colapso_parcial', 'asentamiento'];
// Daños que respaldan que el inmueble no se puede usar.
const RESPALDAN_NO_HABITABLE = [...DANOS_ESTRUCTURALES, 'techo'];
const RESPALDAN_PARCIAL = [...RESPALDAN_NO_HABITABLE, 'grietas_muros', 'cielo_raso', 'instalaciones'];
// Daños que por sí solos rara vez superan el deducible residencial (2 % de la suma asegurada).
const DANOS_MENORES = ['fisuras', 'vidrios', 'desprendimientos'];

export type NivelRegla = Prioridad | 'aviso';

export type ReglaPrioridad = {
  id: string;
  nivel: NivelRegla;
  titulo: string;
};

// Orden de evaluación: alta > media > cierre rápido > baja. Los "aviso" no
// cambian la prioridad; solo informan al equipo.
export const REGLAS_PRIORIDAD: ReglaPrioridad[] = [
  { id: 'dano_estructural', nivel: 'alta', titulo: 'Daño estructural: grietas en columnas, vigas o losas, paredes caídas o pisos hundidos' },
  { id: 'no_habitable', nivel: 'alta', titulo: 'No habitable, respaldado por los daños reportados' },
  { id: 'gasto_alto', nivel: 'alta', titulo: `Gasto estimado alto (${UMBRAL_ALTA} puntos o más)` },
  { id: 'parcial_habitable', nivel: 'media', titulo: 'Parcialmente habitable, respaldado por los daños reportados' },
  { id: 'gasto_medio', nivel: 'media', titulo: `Gasto estimado moderado (${UMBRAL_MEDIA} a ${UMBRAL_ALTA - 1} puntos)` },
  {
    id: 'bajo_deducible',
    nivel: 'rapido',
    titulo: 'Residencial con solo daños menores: probablemente no supera el deducible (2 % de la suma asegurada)',
  },
  { id: 'habitabilidad_sin_respaldo', nivel: 'aviso', titulo: 'Declaró que no es habitable o solo parcialmente, sin daños que lo respalden' },
  { id: 'riesgo_reportado', nivel: 'aviso', titulo: 'Reportó un riesgo de seguridad (gas, electricidad, caída o agua)' },
];

export function puntajeGasto(d: DatosPrioridad): number {
  const danos = d.tiposDano.reduce((suma, t) => suma + (PUNTOS_DANO[t] ?? 0), 0);
  const operacion = d.tipoPropiedad !== 'Residencial' ? (PUNTOS_OPERACION[d.operacion] ?? 0) : 0;
  return Math.round(danos * (FACTOR_EXTENSION[d.extension] ?? 1) + operacion);
}

export function evaluarPrioridad(d: DatosPrioridad): { prioridad: Prioridad; puntaje: number; motivos: string[] } {
  const puntaje = puntajeGasto(d);
  const motivos: string[] = [];
  const tiene = (lista: string[]) => d.tiposDano.some((t) => lista.includes(t));

  if (tiene(DANOS_ESTRUCTURALES)) motivos.push('dano_estructural');
  const noHabitable = d.habitabilidad === 'no' && (tiene(RESPALDAN_NO_HABITABLE) || d.extension === 'total');
  const parcial = d.habitabilidad === 'parcial' && tiene(RESPALDAN_PARCIAL);
  if (noHabitable) motivos.push('no_habitable');
  if (puntaje >= UMBRAL_ALTA) motivos.push('gasto_alto');
  if (parcial) motivos.push('parcial_habitable');

  // Solo daños menores en residencial, sin afectar todo el inmueble: cierre
  // rápido aunque sumen varios (el puntaje de daños menores es bajo por diseño).
  const soloMenores = d.tiposDano.length > 0 && d.tiposDano.every((t) => DANOS_MENORES.includes(t));
  const rapido = d.tipoPropiedad === 'Residencial' && soloMenores && d.extension !== 'total' && !motivos.length;
  if (rapido) motivos.push('bajo_deducible');
  else if (puntaje >= UMBRAL_MEDIA && puntaje < UMBRAL_ALTA) motivos.push('gasto_medio');

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
  return { prioridad, puntaje, motivos };
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
