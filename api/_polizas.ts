// Conector de pólizas. El resto del sistema solo usa `proveedorPolizas()`;
// la fuente se elige con la variable POLIZAS_PROVEEDOR:
//   - "simulado" (por defecto): datos de prueba, siempre iguales para un mismo número.
//   - "http": el sistema de pólizas de ASSA, vía POLIZAS_API_URL y POLIZAS_API_TOKEN.
//     Contrato esperado (ver README):
//       GET {URL}/polizas/{numero}                   -> 200 Poliza (JSON) | 404
//       GET {URL}/polizas/{numero}/documentos/{id}   -> 200 archivo       | 404
import { createHash } from 'node:crypto';

export type CoberturaPoliza = {
  id: string; // mismo id que shared/flujo.ts COBERTURAS
  titulo: string;
  sumaAsegurada: number;
  deducibleTerremoto: { porcentaje: number; minimo: number } | null; // % de la suma asegurada de la cobertura
};

export type DocumentoPoliza = { id: string; nombre: string; tipo: string; fecha: string };

export type Poliza = {
  numero: string;
  fuente: 'simulado' | 'sistema';
  estado: 'vigente' | 'vencida' | 'cancelada';
  producto: string;
  ramo: string;
  vigenciaDesde: string; // AAAA-MM-DD
  vigenciaHasta: string;
  moneda: 'USD';
  asegurado: { nombre: string; identificacion: string; correo: string; telefono: string };
  corredor: { nombre: string; codigo: string; correo: string } | null;
  ubicacionRiesgo: string;
  coberturas: CoberturaPoliza[];
  documentos: DocumentoPoliza[];
};

export type ArchivoPoliza = { cuerpo: BodyInit; tipo: string; nombre: string };

export interface ProveedorPolizas {
  nombre: 'simulado' | 'http';
  buscar(numero: string): Promise<Poliza | null>;
  documento(numero: string, id: string): Promise<ArchivoPoliza | null>;
}

export function proveedorPolizas(): ProveedorPolizas {
  return process.env.POLIZAS_PROVEEDOR === 'http' ? proveedorHttp() : proveedorSimulado;
}

export const normalizarPoliza = (numero: string) => numero.trim().toUpperCase().replace(/\s+/g, '');

// ---------------------------------------------------------------------------
// Sistema de ASSA (HTTP)

function proveedorHttp(): ProveedorPolizas {
  const base = process.env.POLIZAS_API_URL?.replace(/\/$/, '');
  const token = process.env.POLIZAS_API_TOKEN;
  if (!base || !token) throw new Error('POLIZAS_API_URL y POLIZAS_API_TOKEN son obligatorios con POLIZAS_PROVEEDOR=http');
  const pedir = (ruta: string) =>
    fetch(`${base}${ruta}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  return {
    nombre: 'http',
    async buscar(numero) {
      const res = await pedir(`/polizas/${encodeURIComponent(normalizarPoliza(numero))}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Sistema de pólizas respondió ${res.status}`);
      return { ...(await res.json()), fuente: 'sistema' } as Poliza;
    },
    async documento(numero, id) {
      const res = await pedir(`/polizas/${encodeURIComponent(normalizarPoliza(numero))}/documentos/${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      if (!res.ok || !res.body) throw new Error(`Sistema de pólizas respondió ${res.status}`);
      const nombre = /filename="?([^";]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${id}.pdf`;
      return { cuerpo: res.body, tipo: res.headers.get('content-type') ?? 'application/octet-stream', nombre };
    },
  };
}

// ---------------------------------------------------------------------------
// Simulado: mientras no exista la conexión con el sistema de ASSA.

const PRODUCTOS = [
  {
    producto: 'Hogar Seguro',
    ramo: 'Hogar',
    coberturas: [
      ['edificio', 'Edificio o estructura', 0.8],
      ['contenido', 'Contenido', 0.2],
      ['remocion', 'Remoción de escombros', 0.05],
      ['gastos_extra', 'Gastos extraordinarios (alojamiento temporal)', 0.03],
      ['rc', 'Responsabilidad civil', 0.1],
    ],
    suma: [60_000, 450_000],
  },
  {
    producto: 'PYME Protegida',
    ramo: 'Comercial',
    coberturas: [
      ['edificio', 'Edificio o estructura', 0.55],
      ['contenido', 'Mobiliario y equipo de oficina', 0.1],
      ['maquinaria', 'Maquinaria y equipo', 0.15],
      ['mercancia', 'Mercancía o inventario', 0.15],
      ['interrupcion', 'Interrupción de negocio', 0.1],
      ['remocion', 'Remoción de escombros', 0.05],
    ],
    suma: [150_000, 2_500_000],
  },
  {
    producto: 'Incendio y Líneas Aliadas',
    ramo: 'Propiedad',
    coberturas: [
      ['edificio', 'Edificio o estructura', 0.7],
      ['contenido', 'Contenido', 0.25],
      ['vidrios', 'Rotura de vidrios', 0.02],
      ['remocion', 'Remoción de escombros', 0.05],
    ],
    suma: [100_000, 1_500_000],
  },
] as const;

const NOMBRES = ['María Fernández', 'Carlos Méndez', 'Ana Lucía Pérez', 'José Rodríguez', 'Inversiones del Istmo, S.A.', 'Rosa Batista', 'Luis Castillo'];
const CORREDORES = [
  ['Corredora Istmo, S.A.', 'C-1042', 'reclamos@corredoraistmo.example'],
  ['Seguros del Pacífico Corredores', 'C-0877', 'servicio@segpacifico.example'],
  ['Tuasesor, S.A.', 'C-1310', 'atencion@tuasesor.example'],
] as const;
const LUGARES = ['David, Chiriquí', 'Boquete, Chiriquí', 'San Miguelito, Panamá', 'Bella Vista, Panamá', 'Santiago, Veraguas', 'La Chorrera, Panamá Oeste'];

// Números pseudoaleatorios deterministas: el mismo número de póliza siempre da los mismos datos.
function semilla(texto: string) {
  let i = 0;
  return () => createHash('sha256').update(`${texto}:${i++}`).digest().readUInt32BE(0) / 0x1_0000_0000;
}

const redondear = (n: number, a: number) => Math.round(n / a) * a;

export const proveedorSimulado: ProveedorPolizas = {
  nombre: 'simulado',
  async buscar(numeroOriginal) {
    const numero = normalizarPoliza(numeroOriginal);
    // Para probar el caso "póliza no encontrada".
    if (!numero || /NOEXISTE|^0+$/.test(numero)) return null;
    const r = semilla(numero);
    const p = PRODUCTOS[Math.floor(r() * PRODUCTOS.length)];
    const total = redondear(p.suma[0] + r() * (p.suma[1] - p.suma[0]), 5000);
    const azarEstado = r();
    const estado = azarEstado < 0.85 ? 'vigente' : azarEstado < 0.95 ? 'vencida' : 'cancelada';
    // Inicio entre nov-2025 y sep-2026: las vigentes cubren la fecha del sismo (oct-2026).
    const desde = new Date(Date.UTC(2025, 10 + Math.floor(r() * 11), 1 + Math.floor(r() * 27)));
    const hasta = new Date(desde);
    hasta.setUTCFullYear(hasta.getUTCFullYear() + 1);
    if (estado === 'vencida') hasta.setUTCFullYear(2026, 8, 1 + Math.floor(r() * 28));
    const corredor = r() < 0.7 ? CORREDORES[Math.floor(r() * CORREDORES.length)] : null;
    const nombre = NOMBRES[Math.floor(r() * NOMBRES.length)];
    const dia = (d: Date) => d.toISOString().slice(0, 10);
    return {
      numero,
      fuente: 'simulado',
      estado,
      producto: p.producto,
      ramo: p.ramo,
      vigenciaDesde: dia(desde),
      vigenciaHasta: dia(hasta),
      moneda: 'USD',
      asegurado: {
        nombre,
        identificacion: nombre.includes('S.A.') ? `RUC ${155000000 + Math.floor(r() * 999999)}-1-${2020 + Math.floor(r() * 5)}` : `${4 + Math.floor(r() * 5)}-${700 + Math.floor(r() * 299)}-${1000 + Math.floor(r() * 8999)}`,
        correo: `${nombre.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@correo.example`,
        telefono: `6${String(Math.floor(r() * 9999999)).padStart(7, '0')}`,
      },
      corredor: corredor && { nombre: corredor[0], codigo: corredor[1], correo: corredor[2] },
      ubicacionRiesgo: LUGARES[Math.floor(r() * LUGARES.length)],
      coberturas: p.coberturas.map(([id, titulo, parte]) => ({
        id,
        titulo,
        sumaAsegurada: redondear(total * parte, 500),
        deducibleTerremoto: id === 'rc' ? null : { porcentaje: 2, minimo: 250 },
      })),
      documentos: [
        { id: 'condiciones-particulares', nombre: `Condiciones particulares ${numero}.pdf`, tipo: 'Condiciones particulares', fecha: dia(desde) },
        { id: 'condiciones-generales', nombre: `Condiciones generales ${p.producto}.pdf`, tipo: 'Condiciones generales', fecha: '2025-01-01' },
        { id: 'recibo', nombre: `Recibo de prima ${numero}.pdf`, tipo: 'Recibo de prima', fecha: dia(desde) },
      ],
    };
  },
  async documento(numero, id) {
    const poliza = await proveedorSimulado.buscar(numero);
    const doc = poliza?.documentos.find((d) => d.id === id);
    if (!poliza || !doc) return null;
    const lineas = [
      'ASSA Compania de Seguros - DOCUMENTO DE PRUEBA (datos simulados)',
      '',
      doc.tipo,
      `Poliza: ${poliza.numero}   Producto: ${poliza.producto}`,
      `Asegurado: ${poliza.asegurado.nombre}   Identificacion: ${poliza.asegurado.identificacion}`,
      `Vigencia: ${poliza.vigenciaDesde} al ${poliza.vigenciaHasta}   Estado: ${poliza.estado}`,
      `Ubicacion del riesgo: ${poliza.ubicacionRiesgo}`,
      '',
      'Coberturas y sumas aseguradas (USD):',
      ...poliza.coberturas.map(
        (c) =>
          `  - ${c.titulo}: ${c.sumaAsegurada.toLocaleString('en-US')}` +
          (c.deducibleTerremoto ? `  (deducible terremoto ${c.deducibleTerremoto.porcentaje}% de la suma asegurada, min. ${c.deducibleTerremoto.minimo})` : ''),
      ),
      '',
      'Este archivo es generado por el conector simulado mientras se conecta el sistema de polizas de ASSA.',
    ];
    return { cuerpo: pdfDeTexto(lineas), tipo: 'application/pdf', nombre: doc.nombre };
  },
};

// PDF mínimo de una página con texto (Helvetica, Latin-1).
export function pdfDeTexto(lineas: string[]): ArrayBuffer {
  const escapar = (t: string) => t.normalize('NFC').replace(/[\\()]/g, (c) => `\\${c}`);
  const contenido = ['BT', '/F1 11 Tf', '14 TL', '50 790 Td', ...lineas.map((l, i) => `${i ? 'T* ' : ''}(${escapar(l)}) Tj`), 'ET'].join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = Buffer.from(pdf, 'latin1');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
