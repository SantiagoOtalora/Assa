// Límite de solicitudes por IP para las rutas públicas (formulario y consulta),
// contra abusos y bots. Ventanas fijas contadas en la tabla `limites`.
// Si la base de datos no responde, deja pasar: un reporte nunca se pierde por
// el límite (el formulario tiene su propio respaldo en Blob).
import { createHash } from 'node:crypto';
import { asegurarTabla, sql } from './_db.js';

export const LIMITES = {
  reclamo: { maximo: 60, ventanaSeg: 600 }, // 60 reportes cada 10 minutos (oficinas de corredores comparten IP)
  consulta: { maximo: 30, ventanaSeg: 600 },
} as const;

export type AccionLimitada = keyof typeof LIMITES;

// Vercel siempre envía x-forwarded-for con la IP real del cliente.
export function ipDe(request: Request) {
  return (request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '').split(',')[0].trim();
}

// La IP no se guarda: solo un resumen (hash) para contar.
const claveDe = (accion: string, ip: string) => `${accion}:${createHash('sha256').update(ip).digest('base64url').slice(0, 22)}`;

export async function dentroDelLimite(request: Request, accion: AccionLimitada, esperaMaxMs = 1500): Promise<boolean> {
  const ip = ipDe(request);
  if (!ip) return true;
  const { maximo, ventanaSeg } = LIMITES[accion];
  const ventana = Math.floor(Date.now() / 1000 / ventanaSeg);
  const contar = async () => {
    await asegurarTabla();
    const [fila] = await sql`
      INSERT INTO limites (clave, ventana, conteo) VALUES (${claveDe(accion, ip)}, ${ventana}, 1)
      ON CONFLICT (clave, ventana) DO UPDATE SET conteo = limites.conteo + 1
      RETURNING conteo`;
    return Number(fila.conteo) <= maximo;
  };
  try {
    return await Promise.race([contar(), new Promise<boolean>((ok) => setTimeout(() => ok(true), esperaMaxMs))]);
  } catch (e) {
    console.warn('Límite de solicitudes no disponible; se deja pasar', e);
    return true;
  }
}

export const demasiadas = (mensaje: string) =>
  Response.json({ error: mensaje }, { status: 429, headers: { 'retry-after': '600' } });
