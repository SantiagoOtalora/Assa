// Correo del panel (el envío está en api/gestion.ts, tipo 'correo').
//   GET  /api/correo                          -> { proveedor } ("simulado" o "microsoft365")
//   POST /api/correo { accion: 'sincronizar' } -> lee los correos nuevos del buzón
//   POST /api/correo { accion: 'simular', id, texto? } -> solo en modo simulado: un correo
//        entrante de prueba del asegurado al caso, con un adjunto
// Requiere sesión y permiso de comunicación.
import { permisosDe } from '../shared/roles.js';
import { correoEntranteSimulado, procesarEntrante, proveedorCorreo, sincronizarBuzon } from './_correo.js';
import { asegurarTabla, sql } from './_db.js';
import { auditar, noAutorizado, prohibido, puedeVerCaso, usuarioDeSesion } from './_sesion.js';

const error = (status: number, mensaje: string) => Response.json({ error: mensaje }, { status });

// El panel pide sincronizar al abrirse y cada pocos minutos; con varias personas
// conectadas basta una lectura del buzón por minuto en cada instancia.
const ESPERA_MS = 60_000;
let ultimaSincronizacion = 0;

const nombreProveedor = () => (process.env.CORREO_PROVEEDOR === 'microsoft365' ? 'microsoft365' : 'simulado');

export async function GET(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  return Response.json({ proveedor: nombreProveedor() });
}

export async function POST(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  const permisos = permisosDe(u.rol);
  if (!permisos.comunicacion) return prohibido();
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== 'object') return error(400, 'Solicitud inválida.');

  if (cuerpo.accion === 'sincronizar') {
    if (Date.now() - ultimaSincronizacion < ESPERA_MS) return Response.json({ omitido: true });
    ultimaSincronizacion = Date.now();
    try {
      return Response.json(await sincronizarBuzon());
    } catch (e) {
      console.error('No se pudo leer el buzón', e);
      return error(502, 'No se pudo leer el buzón de correo.');
    }
  }

  if (cuerpo.accion === 'simular') {
    if (nombreProveedor() !== 'simulado') return error(400, 'Solo disponible en modo simulado.');
    const id = Number(cuerpo.id);
    if (!Number.isInteger(id) || id <= 0) return error(400, 'Caso inválido.');
    await asegurarTabla();
    const [caso] = await sql`SELECT numero, nombre, correo FROM reclamos_terremoto WHERE id = ${id}`;
    if (!caso) return error(404, 'El caso no existe.');
    if (!(await puedeVerCaso(u, id, permisos.verTodos))) return prohibido();
    const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.slice(0, 4000) : undefined;
    const resultado = await procesarEntrante(correoEntranteSimulado(caso as { numero: string; nombre: string; correo: string }, texto), proveedorCorreo().nombre);
    await auditar(u.id, 'simular_correo', id);
    return Response.json(resultado, { status: 201 });
  }

  return error(400, 'Acción inválida.');
}
