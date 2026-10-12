// Administración de usuarios (solo supervisores). Los usuarios no se borran:
// se desactivan, para conservar la autoría del historial.
//   GET   /api/usuarios                                   -> lista (y asignables para todos los que pueden asignar)
//   POST  /api/usuarios { nombre, correo, rol, organizacion? } -> crea; devuelve la clave temporal una sola vez
//   PATCH /api/usuarios { id, accion: 'restablecer' | 'activar' | 'desactivar' | 'rol', rol? }
import { randomBytes } from 'node:crypto';
import { ROLES_ASIGNABLES, esRol, permisosDe } from '../shared/roles.js';
import { RE_CORREO } from '../shared/catalogos.js';
import { sql } from './_db.js';
import { auditar, hashClave, noAutorizado, prohibido, usuarioDeSesion } from './_sesion.js';

// Clave temporal legible: 14 caracteres sin letras ambiguas.
export function claveTemporal() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return [...randomBytes(14)].map((b) => letras[b % letras.length]).join('');
}

export async function GET(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  const permisos = permisosDe(u.rol);
  if (!permisos.administrarUsuarios && !permisos.asignar) return prohibido();
  const filas = await sql`
    SELECT id, nombre, correo, rol, organizacion, activo, creado_en, ultimo_acceso
    FROM usuarios ORDER BY activo DESC, nombre`;
  // Quien solo asigna ve los usuarios activos asignables, sin datos de acceso.
  if (!permisos.administrarUsuarios) {
    return Response.json({
      usuarios: filas
        .filter((f) => f.activo && (ROLES_ASIGNABLES as string[]).includes(f.rol))
        .map(({ id, nombre, rol, organizacion }) => ({ id, nombre, rol, organizacion })),
    });
  }
  return Response.json({ usuarios: filas }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  if (!permisosDe(u.rol).administrarUsuarios) return prohibido();
  const cuerpo = await request.json().catch(() => ({}));
  const nombre = String(cuerpo.nombre ?? '').trim().slice(0, 80);
  const correo = String(cuerpo.correo ?? '').trim().toLowerCase().slice(0, 160);
  const rol = String(cuerpo.rol ?? '');
  const organizacion = String(cuerpo.organizacion ?? '').trim().slice(0, 120) || null;
  if (nombre.length < 2 || !RE_CORREO.test(correo) || !esRol(rol)) return Response.json({ error: 'Revise nombre, correo y rol.' }, { status: 400 });
  const clave = claveTemporal();
  const filas = await sql`
    INSERT INTO usuarios (nombre, correo, rol, organizacion, clave_hash)
    VALUES (${nombre}, ${correo}, ${rol}, ${organizacion}, ${await hashClave(clave)})
    ON CONFLICT (correo) DO NOTHING
    RETURNING id`;
  if (!filas.length) return Response.json({ error: 'Ya existe un usuario con ese correo.' }, { status: 409 });
  await auditar(u.id, 'usuario_creado', null, { usuarioId: filas[0].id, correo, rol });
  return Response.json({ id: filas[0].id, claveTemporal: clave }, { status: 201 });
}

export async function PATCH(request: Request) {
  const u = await usuarioDeSesion(request);
  if (!u) return noAutorizado();
  if (!permisosDe(u.rol).administrarUsuarios) return prohibido();
  const cuerpo = await request.json().catch(() => ({}));
  const id = Number(cuerpo.id);
  const accion = String(cuerpo.accion ?? '');
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'Usuario inválido.' }, { status: 400 });
  if (id === u.id && accion !== 'restablecer') return Response.json({ error: 'No puede cambiar su propio rol ni desactivarse.' }, { status: 400 });

  let clave: string | undefined;
  let filas;
  if (accion === 'restablecer') {
    clave = claveTemporal();
    filas = await sql`UPDATE usuarios SET clave_hash = ${await hashClave(clave)} WHERE id = ${id} RETURNING id`;
  } else if (accion === 'activar' || accion === 'desactivar') {
    filas = await sql`UPDATE usuarios SET activo = ${accion === 'activar'} WHERE id = ${id} RETURNING id`;
  } else if (accion === 'rol') {
    const rol = String(cuerpo.rol ?? '');
    if (!esRol(rol)) return Response.json({ error: 'Rol inválido.' }, { status: 400 });
    filas = await sql`UPDATE usuarios SET rol = ${rol} WHERE id = ${id} RETURNING id`;
  } else {
    return Response.json({ error: 'Acción inválida.' }, { status: 400 });
  }
  if (!filas.length) return Response.json({ error: 'El usuario no existe.' }, { status: 404 });
  await auditar(u.id, `usuario_${accion}`, null, { usuarioId: id, ...(cuerpo.rol && { rol: cuerpo.rol }) });
  return Response.json({ ok: true, ...(clave && { claveTemporal: clave }) });
}
