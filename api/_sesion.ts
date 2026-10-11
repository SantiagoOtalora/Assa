// Sesión del panel (clave compartida PANEL_CLAVE). Se reemplazará por usuarios
// individuales cuando se implemente el control de accesos.
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'panel_sesion';
export const DURACION_MS = 12 * 60 * 60 * 1000;

function firmar(valor: string, clave: string) {
  return createHmac('sha256', clave).update(valor).digest('base64url');
}

export function iguales(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function sesionValida(request: Request) {
  const clave = process.env.PANEL_CLAVE;
  if (!clave) return false;
  const cookie = request.headers.get('cookie') ?? '';
  const valor = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!valor) return false;
  const [vence, firma] = valor.split('.');
  return Number(vence) > Date.now() && !!firma && iguales(firma, firmar(vence, clave));
}

export function cookieSesion(clave: string) {
  const vence = String(Date.now() + DURACION_MS);
  return `${COOKIE}=${vence}.${firmar(vence, clave)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_MS / 1000}`;
}

export function cookieCierre() {
  return `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export const noAutorizado = () => Response.json({ error: 'No autorizado' }, { status: 401 });
