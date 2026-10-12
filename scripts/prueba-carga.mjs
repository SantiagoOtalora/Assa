// Prueba de carga del formulario contra el AMBIENTE DE PRUEBAS (nunca producción).
// Envía muchos reportes al mismo tiempo (algunos reenviados, como un doble clic) y mide
// tiempos de respuesta, errores y si algún reporte cayó al respaldo (número P-).
//
//   npx vercel env pull .env.pruebas --environment preview --yes
//   npm run prueba-carga -- https://assa-terremoto-xxxx-santiago-os-projects.vercel.app --reportes 300 --simultaneos 50
//
// Opciones: --reportes N (300), --simultaneos N (50), --sin-fotos.
// Las URL de Preview están protegidas por Vercel: defina VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → Settings →
// Deployment Protection → Protection Bypass for Automation) para que el script pueda entrar.
// El límite por IP se omite con el CRON_SECRET del ambiente de pruebas (encabezado x-prueba-carga).
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? Number(args[i + 1]) : porDefecto;
};
const base = args.find((a) => /^https?:\/\//.test(a))?.replace(/\/$/, '');
const total = opcion('reportes', 300);
const simultaneos = opcion('simultaneos', 50);
const conFotos = !args.includes('--sin-fotos');

if (!base) {
  console.error('Indique la URL del ambiente de pruebas. Ejemplo: npm run prueba-carga -- https://assa-terremoto-xxxx.vercel.app');
  process.exit(1);
}
if (new URL(base).hostname === 'assa-terremoto.vercel.app' || process.env.AMBIENTE !== 'pruebas') {
  console.error('La prueba de carga solo corre contra el ambiente de pruebas (variables de Preview en .env.pruebas). No se hizo nada.');
  process.exit(1);
}

const foto = Buffer.from(/'([A-Za-z0-9+/=]+)'/.exec(readFileSync(new URL('../api/_fotoEjemplo.ts', import.meta.url), 'utf8'))[1], 'base64');
const cabeceras = {
  'x-prueba-carga': process.env.CRON_SECRET ?? '',
  ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET && { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }),
};

const DANOS = ['fisuras', 'grietas_muros', 'techo', 'cielo_raso', 'vidrios', 'puertas_ventanas', 'contenido'];
function reporte(i, ref) {
  return {
    ref,
    reportadoPor: 'asegurado',
    nombre: `Carga ${i}`,
    poliza: `CARGA-${i}`,
    unidad: '',
    correo: `carga${i}@ejemplo.com`,
    telefono: '60000000',
    provincia: 'Chiriquí',
    distrito: 'David',
    direccion: `Prueba de carga ${i}`,
    tipoPropiedad: 'Residencial',
    tiposDano: [DANOS[i % DANOS.length]],
    habitabilidad: 'si',
    riesgos: [],
    extension: 'puntual',
    operacion: '',
    fechaDano: '2026-10-10',
    descripcion: 'Reporte generado por la prueba de carga del ambiente de pruebas.',
    consentimiento: true,
  };
}

// Cada décimo reporte se reenvía al mismo tiempo (misma ref): debe recibir el mismo número.
const envios = [];
for (let i = 0; i < total; i++) {
  const ref = crypto.randomUUID();
  envios.push({ i, ref });
  if (i % 10 === 0) envios.push({ i, ref, reenvio: true });
}

const resultados = [];
async function enviar({ i, ref, reenvio }) {
  const cuerpo = new FormData();
  cuerpo.append('datos', JSON.stringify(reporte(i, ref)));
  if (conFotos) cuerpo.append('fotos', new Blob([foto], { type: 'image/jpeg' }), 'foto.jpg');
  const inicio = performance.now();
  try {
    const res = await fetch(`${base}/api/reclamos`, { method: 'POST', body: cuerpo, headers: cabeceras });
    const json = await res.json().catch(() => ({}));
    resultados.push({ ref, reenvio, status: res.status, numero: json.numero, error: json.error, ms: performance.now() - inicio });
  } catch (e) {
    resultados.push({ ref, reenvio, status: 0, error: String(e), ms: performance.now() - inicio });
  }
}

console.log(`Enviando ${envios.length} solicitudes (${total} reportes, ${envios.length - total} reenvíos) de a ${simultaneos} a ${base}…`);
const inicio = performance.now();
let siguiente = 0;
await Promise.all(
  Array.from({ length: simultaneos }, async () => {
    while (siguiente < envios.length) await enviar(envios[siguiente++]);
  }),
);
const segundos = (performance.now() - inicio) / 1000;

const tiempos = resultados.map((r) => r.ms).sort((a, b) => a - b);
const percentil = (p) => Math.round(tiempos[Math.min(tiempos.length - 1, Math.floor((p / 100) * tiempos.length))]);
const porEstado = {};
for (const r of resultados) (porEstado[r.status] ??= []).push(r);
const numeros = new Map();
let inconsistentes = 0;
for (const r of resultados.filter((x) => x.numero)) {
  if (numeros.has(r.ref) && numeros.get(r.ref) !== r.numero) inconsistentes++;
  numeros.set(r.ref, r.numero);
}
const respaldo = [...numeros.values()].filter((n) => n.startsWith('P-')).length;

console.log(`\nTerminó en ${segundos.toFixed(1)} s (${(resultados.length / segundos).toFixed(1)} solicitudes por segundo).`);
console.log('Respuestas:', Object.fromEntries(Object.entries(porEstado).map(([k, v]) => [k === '0' ? 'sin respuesta' : k, v.length])));
console.log(`Tiempo de respuesta: mediana ${percentil(50)} ms · p95 ${percentil(95)} ms · p99 ${percentil(99)} ms · máximo ${Math.round(tiempos.at(-1))} ms`);
console.log(`Reportes registrados: ${numeros.size} de ${total} (${respaldo} en respaldo P-, se cargan con el respaldo diario)`);
console.log(`Reenvíos con un número distinto al original: ${inconsistentes} (debe ser 0)`);
const errores = [...new Set(resultados.filter((r) => r.status !== 201).map((r) => `${r.status} ${r.error ?? ''}`.trim()))].slice(0, 5);
if (errores.length) console.log('Ejemplos de errores:', errores);

const salud = await fetch(`${base}/api/salud`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, ...cabeceras } })
  .then((r) => r.json())
  .catch(() => null);
if (salud) console.log('\nSalud después de la prueba:', JSON.stringify(salud.revisiones ?? salud, null, 2));

process.exit(numeros.size === total && inconsistentes === 0 ? 0 : 1);
