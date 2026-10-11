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
  { id: 'si', titulo: 'Sí, se puede usar con normalidad' },
  { id: 'parcial', titulo: 'Parcialmente, algunas áreas no son seguras' },
  { id: 'no', titulo: 'No, no es seguro permanecer' },
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

export type Prioridad = 'alta' | 'media' | 'baja';

export type DatosPrioridad = {
  habitabilidad: string;
  riesgos: string[];
  tiposDano: string[];
  extension: string;
  operacion: string;
};

export type ReglaPrioridad = {
  id: string;
  prioridad: Exclude<Prioridad, 'baja'>;
  titulo: string;
  aplica: (d: DatosPrioridad) => boolean;
};

const DANOS_GRAVES = ['grietas_estructurales', 'colapso_parcial', 'asentamiento'];
const DANOS_MODERADOS = ['techo', 'cielo_raso', 'puertas_ventanas', 'instalaciones', 'tanques', 'perimetro', 'maquinaria'];

// Reglas de prioridad: definen el orden en que se atienden los reportes.
// Cualquier regla "alta" que aplique => prioridad alta; si solo aplican
// reglas "media" => media; si ninguna aplica => baja.
export const REGLAS_PRIORIDAD: ReglaPrioridad[] = [
  { id: 'no_habitable', prioridad: 'alta', titulo: 'Inmueble no habitable', aplica: (d) => d.habitabilidad === 'no' },
  { id: 'gas', prioridad: 'alta', titulo: 'Olor o fuga de gas', aplica: (d) => d.riesgos.includes('gas') },
  { id: 'electrico', prioridad: 'alta', titulo: 'Riesgo eléctrico', aplica: (d) => d.riesgos.includes('electrico') },
  { id: 'caida', prioridad: 'alta', titulo: 'Elementos que pueden caer', aplica: (d) => d.riesgos.includes('caida') },
  {
    id: 'dano_estructural',
    prioridad: 'alta',
    titulo: 'Daño estructural (grietas en columnas, vigas o losas; paredes caídas; pisos hundidos)',
    aplica: (d) => d.tiposDano.some((t) => DANOS_GRAVES.includes(t)),
  },
  { id: 'habitable_parcial', prioridad: 'media', titulo: 'Habitable solo parcialmente', aplica: (d) => d.habitabilidad === 'parcial' },
  { id: 'agua', prioridad: 'media', titulo: 'Fuga de agua o inundación', aplica: (d) => d.riesgos.includes('agua') },
  { id: 'todo_inmueble', prioridad: 'media', titulo: 'Todo el inmueble afectado', aplica: (d) => d.extension === 'total' },
  { id: 'operacion_detenida', prioridad: 'media', titulo: 'Operación del negocio detenida', aplica: (d) => d.operacion === 'detenida' },
  {
    id: 'dano_moderado',
    prioridad: 'media',
    titulo: 'Daño en techo, cielo raso, puertas o ventanas, tuberías o cableado, equipos exteriores, cercas o maquinaria',
    aplica: (d) => d.tiposDano.some((t) => DANOS_MODERADOS.includes(t)),
  },
];

export function evaluarPrioridad(d: DatosPrioridad): { prioridad: Prioridad; motivos: string[] } {
  const reglas = REGLAS_PRIORIDAD.filter((r) => r.aplica(d));
  const prioridad = reglas.some((r) => r.prioridad === 'alta') ? 'alta' : reglas.length ? 'media' : 'baja';
  return { prioridad, motivos: reglas.map((r) => r.id) };
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
