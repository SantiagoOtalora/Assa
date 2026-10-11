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
  {
    grupo: 'Paredes y estructura',
    tipos: [
      { id: 'fisuras', titulo: 'Fisuras superficiales', detalle: 'Líneas finas en pintura, repello o acabados (menos de 1 mm)' },
      { id: 'grietas_muros', titulo: 'Grietas en paredes', detalle: 'Aberturas visibles en bloques o paredes divisorias' },
      { id: 'grietas_estructurales', titulo: 'Grietas estructurales', detalle: 'En columnas, vigas, losas o escaleras' },
      { id: 'colapso_parcial', titulo: 'Colapso parcial de paredes o muros', detalle: 'Paredes caídas, inclinadas o desplomadas' },
      { id: 'asentamiento', titulo: 'Hundimiento o desnivel', detalle: 'Pisos hundidos, inclinados o fundación afectada' },
    ],
  },
  {
    grupo: 'Techo, acabados y aberturas',
    tipos: [
      { id: 'techo', titulo: 'Daños en techo o cubierta', detalle: 'Tejas o láminas desplazadas, filtraciones' },
      { id: 'cielo_raso', titulo: 'Cielo raso dañado o caído', detalle: 'Gypsum, plafones o losetas desprendidas' },
      { id: 'desprendimientos', titulo: 'Desprendimiento de acabados', detalle: 'Repello, azulejos, baldosas o fachada' },
      { id: 'puertas_ventanas', titulo: 'Puertas o ventanas trabadas', detalle: 'Marcos deformados que no abren o cierran bien' },
      { id: 'vidrios', titulo: 'Vidrios rotos', detalle: 'Ventanas, puertas de vidrio o fachadas' },
    ],
  },
  {
    grupo: 'Instalaciones y exteriores',
    tipos: [
      { id: 'instalaciones', titulo: 'Instalaciones dañadas', detalle: 'Tuberías de agua, electricidad o gas' },
      { id: 'tanques', titulo: 'Tanques de agua o equipos en techo', detalle: 'Tanques, aires acondicionados, paneles solares' },
      { id: 'perimetro', titulo: 'Muros perimetrales o cercas', detalle: 'Muros de colindancia, portones, cercas' },
    ],
  },
  {
    grupo: 'Contenido y equipos',
    tipos: [
      { id: 'contenido', titulo: 'Contenido del inmueble', detalle: 'Muebles, electrodomésticos, artículos personales' },
      { id: 'maquinaria', titulo: 'Maquinaria o equipo industrial', detalle: 'Equipos de producción, estanterías, racks' },
      { id: 'inventario', titulo: 'Mercancía o inventario', detalle: 'Productos caídos, rotos o contaminados' },
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
