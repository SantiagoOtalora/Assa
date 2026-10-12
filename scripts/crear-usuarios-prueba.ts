// Crea los usuarios de prueba (si no existen) y escribe sus claves en un archivo local.
// Uso (desde la raíz del repo, con las variables de producción en .env.local):
//   npx vercel env pull .env.local --environment production
//   npx esbuild scripts/crear-usuarios-prueba.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/crear-usuarios.mjs --external:@neondatabase/serverless --external:@vercel/blob
//   cp /tmp/crear-usuarios.mjs ./_crear.mjs && SALIDA=/tmp/claves.txt node --env-file=.env.local _crear.mjs; rm _crear.mjs
// Los usuarios que ya existen no se modifican: para cambiar su clave use "Restablecer clave" en el panel.
import { writeFileSync } from 'node:fs';
import { asegurarTabla, sql } from '../api/_db';
import { hashClave } from '../api/_sesion';
import { claveTemporal } from '../api/usuarios';

const USUARIOS = [
  ['supervisor@prueba.assa', 'Supervisor de Prueba', 'supervisor', null],
  ['analista1@prueba.assa', 'Analista Interno 1', 'analista', null],
  ['analista2@prueba.assa', 'Analista Interno 2', 'analista', null],
  ['ajustador@prueba.assa', 'Ajustador Externo de Prueba', 'ajustador', 'Ajustadora de Prueba, S.A.'],
  ['comercial@prueba.assa', 'Comercial de Prueba', 'comercial', null],
  ['canales@prueba.assa', 'Canales de Prueba', 'canales', null],
] as const;

await asegurarTabla();
const salida: string[] = [];
for (const [correo, nombre, rol, organizacion] of USUARIOS) {
  const clave = claveTemporal();
  const filas = await sql`
    INSERT INTO usuarios (correo, nombre, rol, organizacion, clave_hash)
    VALUES (${correo}, ${nombre}, ${rol}, ${organizacion}, ${await hashClave(clave)})
    ON CONFLICT (correo) DO NOTHING RETURNING id`;
  salida.push(`${rol.padEnd(11)} ${correo.padEnd(24)} ${filas.length ? clave : '(ya existía: no se cambió)'}`);
}
writeFileSync(process.env.SALIDA ?? 'claves-prueba.txt', salida.join('\n') + '\n', { mode: 0o600 });
console.log(`Listo: ${salida.length} usuarios procesados. Claves en ${process.env.SALIDA ?? 'claves-prueba.txt'} (no lo suba al repositorio).`);
