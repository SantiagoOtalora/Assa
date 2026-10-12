// Sesión por usuario del panel. La cookie lleva el id del usuario, el
// vencimiento y una firma (SESION_SECRETO); en cada solicitud se verifica que
// el usuario siga activo, así que desactivarlo corta el acceso de inmediato.
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { esRol, type UsuarioSesion } from '../shared/roles.js';
import { asegurarTabla, sql } from './_db.js';

const scrypt = promisify(scryptCb) as (clave: string, sal: Buffer, largo: number) => Promise<Buffer>;
const COOKIE = 'panel_sesion';
export const DURACION_MS = 12 * 60 * 60 * 1000;

export async function hashClave(clave: string) {
  const sal = randomBytes(16);
  const hash = await scrypt(clave, sal, 32);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export async function verificarClave(clave: string, guardado: string) {
  const [tipo, sal, hash] = guardado.split('$');
  if (tipo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scrypt(clave, Buffer.from(sal, 'base64'), esperado.length);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

function secreto() {
  const s = process.env.SESION_SECRETO;
  if (!s || s.length < 32) throw new Error('SESION_SECRETO no está configurado');
  return s;
}

const firmar = (valor: string) => createHmac('sha256', secreto()).update(valor).digest('base64url');

function iguales(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function cookieSesion(usuarioId: number) {
  const valor = `${usuarioId}.${Date.now() + DURACION_MS}`;
  return `${COOKIE}=${valor}.${firmar(valor)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_MS / 1000}`;
}

export function cookieCierre() {
  return `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function usuarioDeSesion(request: Request): Promise<UsuarioSesion | null> {
  const cookie = request.headers.get('cookie') ?? '';
  const valor = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!valor) return null;
  const [id, vence, firma] = valor.split('.');
  if (!id || !vence || !firma || Number(vence) < Date.now() || !iguales(firma, firmar(`${id}.${vence}`))) return null;
  await asegurarTabla();
  const [u] = await sql`SELECT id, nombre, correo, rol, organizacion FROM usuarios WHERE id = ${Number(id)} AND activo`;
  if (!u || !esRol(u.rol)) return null;
  return { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, organizacion: u.organizacion };
}

export async function auditar(usuarioId: number | null, accion: string, reclamoId: number | null = null, detalle: object = {}) {
  try {
    await sql`
      INSERT INTO auditoria (usuario_id, accion, reclamo_id, detalle)
      VALUES (${usuarioId}, ${accion}, ${reclamoId}, ${JSON.stringify(detalle)}::jsonb)`;
  } catch (e) {
    // La auditoría nunca debe impedir el trabajo; queda en los logs.
    console.error('No se pudo registrar la auditoría', accion, e);
  }
}

// Un usuario sin "verTodos" (ajustador externo) solo accede a sus casos asignados.
export async function puedeVerCaso(u: UsuarioSesion, reclamoId: number, verTodos: boolean) {
  if (verTodos) return true;
  const [fila] = await sql`SELECT 1 FROM reclamos_terremoto WHERE id = ${reclamoId} AND asignado_usuario_id = ${u.id}`;
  return !!fila;
}

export const noAutorizado = () => Response.json({ error: 'Su sesión venció. Vuelva a entrar.' }, { status: 401 });
export const prohibido = () => Response.json({ error: 'Su usuario no tiene permiso para esta acción.' }, { status: 403 });
