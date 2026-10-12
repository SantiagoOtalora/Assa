// Carga datos de ejemplo en el AMBIENTE DE PRUEBAS (Preview de Vercel): usuarios de
// prueba y 40 reclamos ficticios con fases, asignaciones y comunicaciones.
// Se niega a correr si AMBIENTE no es "pruebas" (producción no tiene esa variable).
// Se puede correr varias veces: los reclamos tienen ref fija y no se duplican, y los
// usuarios que ya existen no se modifican.
//   npm run datos-prueba     (baja las variables de Preview a .env.pruebas y corre este script)
// Las claves de los usuarios nuevos quedan en claves-pruebas.txt (no se sube al repositorio).
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { EXTENSION, HABITABILIDAD, IDS_DANO, OPERACION, PROVINCIAS, RIESGOS, calcularPrioridad } from '../shared/catalogos';
import { ESTADOS, MOTIVOS_DECLINACION } from '../shared/flujo';
import { asegurarTabla, guardarReclamo, sql, type Reclamo } from '../api/_db';
import { hashClave } from '../api/_sesion';
import { claveTemporal } from '../api/usuarios';

if (process.env.AMBIENTE !== 'pruebas') {
  console.error('Este script solo corre en el ambiente de pruebas (AMBIENTE=pruebas). No se hizo nada.');
  process.exit(1);
}

const USUARIOS = [
  ['supervisor@prueba.assa', 'Supervisor de Prueba', 'supervisor', null],
  ['analista1@prueba.assa', 'Analista Interno 1', 'analista', null],
  ['analista2@prueba.assa', 'Analista Interno 2', 'analista', null],
  ['ajustador@prueba.assa', 'Ajustador Externo de Prueba', 'ajustador', 'Ajustadora de Prueba, S.A.'],
  ['comercial@prueba.assa', 'Comercial de Prueba', 'comercial', null],
  ['canales@prueba.assa', 'Canales de Prueba', 'canales', null],
] as const;

const NOMBRES = ['María González', 'José Rodríguez', 'Ana Pérez', 'Luis Batista', 'Carmen Castillo', 'Roberto Vega', 'Yaritza Morales', 'Eduardo Chen'];
const RELATOS = [
  'Se abrieron grietas en las paredes de la sala y la cocina después del sismo.',
  'Se cayó parte del cielo raso del cuarto principal y se rompieron vidrios de las ventanas.',
  'El portón quedó desnivelado y el muro de colindancia tiene una grieta grande.',
  'Hay grietas en una columna del estacionamiento y las puertas no cierran bien.',
  'Se cayó mercancía de los anaqueles y se dañó parte del inventario.',
];

// Números pseudoaleatorios deterministas: cada corrida genera los mismos datos.
let semilla = 20261010;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const uno = <T,>(lista: readonly T[]) => lista[Math.floor(azar() * lista.length)];
const refFija = (i: number) => {
  const h = createHash('sha256').update(`datos-prueba-${i}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

await asegurarTabla();

const claves: string[] = [];
for (const [correo, nombre, rol, organizacion] of USUARIOS) {
  const clave = claveTemporal();
  const filas = await sql`
    INSERT INTO usuarios (correo, nombre, rol, organizacion, clave_hash)
    VALUES (${correo}, ${nombre}, ${rol}, ${organizacion}, ${await hashClave(clave)})
    ON CONFLICT (correo) DO NOTHING RETURNING id`;
  claves.push(`${rol.padEnd(11)} ${correo.padEnd(24)} ${filas.length ? clave : '(ya existía: no se cambió)'}`);
}
const asignables = await sql`SELECT id, nombre FROM usuarios WHERE rol IN ('analista', 'ajustador') AND correo LIKE '%@prueba.assa' ORDER BY id`;

let nuevos = 0;
for (let i = 0; i < 40; i++) {
  const provincia = uno(Object.keys(PROVINCIAS));
  const tipoPropiedad = azar() < 0.75 ? 'Residencial' : uno(['Comercial', 'Industrial']);
  const nombre = uno(NOMBRES);
  const recibido = new Date(Date.now() - Math.floor(azar() * 6 * 86_400_000));
  const datos = {
    tipoPropiedad,
    tiposDano: [...new Set([uno(IDS_DANO), uno(IDS_DANO)])],
    habitabilidad: uno(HABITABILIDAD).id,
    riesgos: azar() < 0.2 ? [uno(RIESGOS).id] : [],
    extension: uno(EXTENSION).id,
    operacion: tipoPropiedad === 'Residencial' ? '' : uno(OPERACION).id,
  };
  const reclamo: Reclamo = {
    ...datos,
    ref: refFija(i),
    recibidoEn: recibido.toISOString(),
    prioridad: calcularPrioridad(datos),
    nombre,
    poliza: `PRUEBA-${String(100 + i)}`,
    unidad: '',
    correo: `${nombre.split(' ')[0].toLowerCase()}.${i}@ejemplo.com`,
    telefono: `6${String(1000000 + i * 7919).slice(0, 7)}`,
    provincia,
    distrito: uno(PROVINCIAS[provincia]),
    direccion: `Calle de prueba ${i + 1}`,
    fechaDano: '2026-10-10',
    descripcion: uno(RELATOS),
    fotos: [],
    consentimiento: true,
    reportadoPor: azar() < 0.3 ? 'corredor' : 'asegurado',
  };
  if (reclamo.reportadoPor === 'corredor') {
    Object.assign(reclamo, { reportanteNombre: 'Corredora de Prueba', reportanteCodigo: 'C-PRUEBA', reportanteCorreo: 'corredora@ejemplo.com' });
  }
  const numero = await guardarReclamo(reclamo);
  const [caso] = await sql`SELECT id, estado FROM reclamos_terremoto WHERE numero = ${numero}`;
  // Solo se gestionan los reclamos recién creados (no se repite en otra corrida).
  const [ya] = await sql`SELECT 1 FROM reclamo_eventos WHERE reclamo_id = ${caso.id} LIMIT 1`;
  if (ya || caso.estado !== 'ingresado') continue;
  nuevos++;
  const fase = uno(ESTADOS).id;
  if (fase !== 'ingresado') {
    const motivo = fase === 'declinado' ? uno(MOTIVOS_DECLINACION).id : null;
    const datosEvento = { de: 'ingresado', a: fase, ...(motivo && { motivoCierre: motivo }) };
    await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto SET estado = ${fase}, motivo_cierre = ${motivo}, fase_desde = now(), actualizado_en = now()
        WHERE id = ${caso.id} RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, 'Supervisor de Prueba', 'estado', ${JSON.stringify(datosEvento)}::jsonb FROM cambio`;
  }
  if (asignables.length && azar() < 0.6) {
    const a = uno(asignables);
    await sql`
      WITH cambio AS (
        UPDATE reclamos_terremoto SET asignado_a = ${a.nombre}, asignado_usuario_id = ${a.id}, actualizado_en = now()
        WHERE id = ${caso.id} RETURNING id
      )
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      SELECT id, 'Supervisor de Prueba', 'asignacion', ${JSON.stringify({ de: null, a: a.nombre, aUsuarioId: a.id })}::jsonb FROM cambio`;
  }
  if (azar() < 0.5) {
    const datosEvento = { canal: uno(['llamada', 'whatsapp']), resultado: uno(['contactado', 'no_contesta', 'mensaje_enviado']), texto: '' };
    await sql`
      INSERT INTO reclamo_eventos (reclamo_id, autor, tipo, datos)
      VALUES (${caso.id}, 'Canales de Prueba', 'comunicacion', ${JSON.stringify(datosEvento)}::jsonb)`;
  }
}

writeFileSync('claves-pruebas.txt', claves.join('\n') + '\n', { mode: 0o600 });
console.log(`Listo: ${USUARIOS.length} usuarios revisados y ${nuevos} reclamos de ejemplo nuevos. Claves en claves-pruebas.txt (no lo suba al repositorio).`);
