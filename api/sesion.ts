// Sesión del panel.
//   POST   /api/sesion { correo, clave }            -> entra (cookie de 12 h)
//   GET    /api/sesion                              -> usuario actual y sus permisos
//   PATCH  /api/sesion { claveActual, claveNueva }  -> cambia la propia clave
//   DELETE /api/sesion                              -> sale
import { permisosDe } from '../shared/roles.js';
import { asegurarTabla, sql } from './_db.js';
import { auditar, cookieCierre, cookieSesion, hashClave, noAutorizado, usuarioDeSesion, verificarClave } from './_sesion.js';

export const LARGO_MIN_CLAVE = 10;
const INTENTOS_MAX = 5;

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => ({}));
  const correo = String(cuerpo.correo ?? '').trim().toLowerCase().slice(0, 160);
  const clave = String(cuerpo.clave ?? '').slice(0, 200);
  if (!correo || !clave) return Response.json({ error: 'Ingrese su correo y su clave.' }, { status: 400 });

  await asegurarTabla();
  const [{ fallidos }] = await sql`
    SELECT count(*)::int AS fallidos FROM auditoria
    WHERE accion = 'login_fallido' AND detalle->>'correo' = ${correo} AND creado_en > now() - interval '15 minutes'`;
  if (fallidos >= INTENTOS_MAX) {
    return Response.json({ error: 'Demasiados intentos. Espere 15 minutos o pida a un supervisor que restablezca su clave.' }, { status: 429 });
  }

  const [u] = await sql`SELECT id, clave_hash, activo FROM usuarios WHERE correo = ${correo}`;
  if (!u || !u.activo || !(await verificarClave(clave, u.clave_hash))) {
    await auditar(u?.id ?? null, 'login_fallido', null, { correo });
    await new Promise((ok) => setTimeout(ok, 600));
    return Response.json({ error: 'Correo o clave incorrectos.' }, { status: 401 });
  }
  await sql`UPDATE usuarios SET ultimo_acceso = now() WHERE id = ${u.id}`;
  await auditar(u.id, 'login');
  return new Response(null, { status: 204, headers: { 'set-cookie': cookieSesion(u.id) } });
}

export async function GET(request: Request) {
  const usuario = await usuarioDeSesion(request);
  if (!usuario) return noAutorizado();
  return Response.json({ usuario, permisos: permisosDe(usuario.rol) }, { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const usuario = await usuarioDeSesion(request);
  if (!usuario) return noAutorizado();
  const cuerpo = await request.json().catch(() => ({}));
  const actual = String(cuerpo.claveActual ?? '');
  const nueva = String(cuerpo.claveNueva ?? '');
  if (nueva.length < LARGO_MIN_CLAVE) return Response.json({ error: `La clave nueva debe tener al menos ${LARGO_MIN_CLAVE} caracteres.` }, { status: 400 });
  const [u] = await sql`SELECT clave_hash FROM usuarios WHERE id = ${usuario.id}`;
  if (!(await verificarClave(actual, u.clave_hash))) return Response.json({ error: 'La clave actual no es correcta.' }, { status: 400 });
  await sql`UPDATE usuarios SET clave_hash = ${await hashClave(nueva)} WHERE id = ${usuario.id}`;
  await auditar(usuario.id, 'cambio_clave');
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const usuario = await usuarioDeSesion(request).catch(() => null);
  if (usuario) await auditar(usuario.id, 'logout');
  return new Response(null, { status: 204, headers: { 'set-cookie': cookieCierre() } });
}
