// Estado de la plataforma, para el monitoreo externo y el panel.
//   GET /api/salud -> 200 { estado: 'ok' | 'degradado', ambiente } o 503 { estado: 'caido', ambiente }
// Sin credenciales solo responde el estado. Con `Authorization: Bearer CRON_SECRET`
// o la sesión de un supervisor, también el detalle de cada revisión:
//   - baseDeDatos: responde (y en cuánto tiempo)
//   - archivos: Vercel Blob responde
//   - pendientes: reportes guardados en respaldo que aún no están en la base de datos
//   - respaldo: fecha del último respaldo diario (degradado si tiene más de 36 horas)
//   - correo: proveedor activo y correos sin caso esperando en la bandeja
// "caido" = la base de datos o los archivos no responden: el formulario igual
// guarda los reportes si al menos uno de los dos funciona.
import { list } from '@vercel/blob';
import { permisosDe } from '../shared/roles.js';
import { asegurarTabla, sql } from './_db.js';
import { usuarioDeSesion } from './_sesion.js';

type Revision = { ok: boolean; detalle: string; ms?: number };

const conLimite = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error(`sin respuesta en ${ms} ms`)), ms))]);

async function medir(fn: () => Promise<string>): Promise<Revision> {
  const inicio = Date.now();
  try {
    const detalle = await conLimite(fn(), 5000);
    return { ok: true, detalle, ms: Date.now() - inicio };
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e), ms: Date.now() - inicio };
  }
}

async function listarTodo(prefix: string) {
  const blobs: { pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...pagina.blobs);
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);
  return blobs;
}

export async function revisar() {
  let refsPendientes: string[] = [];
  let ultimoRespaldo: string | null = null;

  const baseDeDatos = await medir(async () => {
    await asegurarTabla();
    const [f] = await sql`SELECT count(*)::int AS n FROM reclamos_terremoto`;
    return `${f.n} reclamos`;
  });
  const archivos = await medir(async () => {
    const [pendientes, respaldos] = await Promise.all([listarTodo('pendientes/'), listarTodo('respaldos/')]);
    refsPendientes = pendientes.map((b) => b.pathname.slice('pendientes/'.length, -'.json'.length));
    ultimoRespaldo = respaldos.map((b) => b.pathname.slice('respaldos/'.length, -'.json'.length)).sort().pop() ?? null;
    return 'responde';
  });

  // Los JSON de pendientes/ se conservan como copia: solo cuentan los que aún no están en la tabla.
  let sinCargar: number | null = null;
  if (baseDeDatos.ok && archivos.ok) {
    const cargados = refsPendientes.length
      ? await sql`SELECT count(*)::int AS n FROM reclamos_terremoto WHERE ref = ANY(${refsPendientes})`.catch(() => null)
      : [{ n: 0 }];
    if (cargados) sinCargar = refsPendientes.length - cargados[0].n;
  }
  const pendientes: Revision = {
    ok: !sinCargar,
    detalle: sinCargar == null ? 'no se pudo revisar' : sinCargar ? `${sinCargar} reportes en respaldo, se cargan en el próximo respaldo diario` : 'ninguno',
  };

  const horas = ultimoRespaldo ? (Date.now() - new Date(`${ultimoRespaldo}T08:00:00Z`).getTime()) / 3_600_000 : null;
  const respaldo: Revision = {
    ok: horas !== null && horas <= 36,
    detalle: ultimoRespaldo ? `último: ${ultimoRespaldo}` : archivos.ok ? 'todavía no hay respaldos' : 'no se pudo revisar',
  };

  const proveedor = process.env.CORREO_PROVEEDOR === 'microsoft365' ? 'microsoft365' : 'simulado';
  let correo: Revision = { ok: true, detalle: proveedor };
  if (baseDeDatos.ok) {
    const filas = await sql`SELECT count(*)::int AS n FROM correos_recibidos WHERE reclamo_id IS NULL AND descartado_en IS NULL`.catch(() => null);
    if (filas) correo = { ok: true, detalle: `${proveedor} · ${filas[0].n} correos sin caso` };
  }

  const revisiones = { baseDeDatos, archivos, pendientes, respaldo, correo };
  const estado = !baseDeDatos.ok || !archivos.ok ? 'caido' : Object.values(revisiones).every((r) => r.ok) ? 'ok' : 'degradado';
  const ambiente = process.env.AMBIENTE === 'pruebas' ? 'pruebas' : 'produccion';
  return { estado, ambiente, revisado: new Date().toISOString(), revisiones };
}

async function autorizado(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && request.headers.get('authorization') === `Bearer ${secreto}`) return true;
  try {
    const u = await usuarioDeSesion(request);
    return !!u && permisosDe(u.rol).administrarUsuarios;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const resultado = await revisar();
  const cuerpo = (await autorizado(request)) ? resultado : { estado: resultado.estado, ambiente: resultado.ambiente, revisado: resultado.revisado };
  if (resultado.estado !== 'ok') console.error('Salud', JSON.stringify(resultado));
  return Response.json(cuerpo, { status: resultado.estado === 'caido' ? 503 : 200, headers: { 'cache-control': 'no-store' } });
}
