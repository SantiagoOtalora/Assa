// Roles del panel y lo que puede hacer cada uno. Los permisos se aplican en
// el servidor (api/); el panel solo los usa para mostrar u ocultar opciones.

export type Permisos = {
  verBI: boolean; // indicadores y gráficos
  verTodos: boolean; // todos los reclamos (si no, solo los asignados)
  verCosto: boolean; // costo estimado, prioridad y reglas
  cambiarFase: boolean;
  asignar: boolean;
  analisis: boolean; // causa y coberturas con montos
  documentos: boolean; // subir documentos (ver: todos los que ven el caso)
  comunicacion: boolean; // plantillas y registro de contactos
  notas: boolean;
  administrarUsuarios: boolean;
};

const NADA: Permisos = {
  verBI: false,
  verTodos: false,
  verCosto: false,
  cambiarFase: false,
  asignar: false,
  analisis: false,
  documentos: false,
  comunicacion: false,
  notas: false,
  administrarUsuarios: false,
};

export const ROLES = [
  {
    id: 'supervisor',
    titulo: 'Supervisor de reclamos',
    descripcion: 'Ve y gestiona todos los reclamos, el BI y administra usuarios.',
    permisos: { ...NADA, verBI: true, verTodos: true, verCosto: true, cambiarFase: true, asignar: true, analisis: true, documentos: true, comunicacion: true, notas: true, administrarUsuarios: true },
  },
  {
    id: 'analista',
    titulo: 'Analista interno',
    descripcion: 'Gestiona todos los reclamos: fase, análisis, documentos y comunicación. No ve el BI.',
    permisos: { ...NADA, verTodos: true, verCosto: true, cambiarFase: true, asignar: true, analisis: true, documentos: true, comunicacion: true, notas: true },
  },
  {
    id: 'ajustador',
    titulo: 'Analista o ajustador externo',
    descripcion: 'Solo ve los reclamos que tiene asignados. Registra análisis, documentos y notas. No ve costos estimados ni el BI.',
    permisos: { ...NADA, analisis: true, documentos: true, notas: true },
  },
  {
    id: 'comercial',
    titulo: 'Comercial',
    descripcion: 'Consulta el estado de todos los reclamos y el BI. Solo lectura.',
    permisos: { ...NADA, verBI: true, verTodos: true, verCosto: true },
  },
  {
    id: 'canales',
    titulo: 'Canales',
    descripcion: 'Lleva las comunicaciones con asegurados y corredores. Ve todos los reclamos.',
    permisos: { ...NADA, verTodos: true, comunicacion: true, documentos: true, notas: true },
  },
] as const satisfies readonly { id: string; titulo: string; descripcion: string; permisos: Permisos }[];

export type Rol = (typeof ROLES)[number]['id'];

export const permisosDe = (rol: string): Permisos => ROLES.find((r) => r.id === rol)?.permisos ?? NADA;
export const esRol = (rol: string): rol is Rol => ROLES.some((r) => r.id === rol);

// Roles a los que se puede asignar un reclamo.
export const ROLES_ASIGNABLES: Rol[] = ['analista', 'ajustador', 'supervisor'];

export type UsuarioSesion = { id: number; nombre: string; correo: string; rol: Rol; organizacion: string | null };
