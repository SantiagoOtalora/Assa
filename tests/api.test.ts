// Pruebas de la API contra un Postgres local (nunca contra producción).
// Requiere TEST_DATABASE_URL, p. ej. postgres://postgres@localhost:5433/postgres
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;
if (!URL_PRUEBAS || !/@(localhost|127\.0\.0\.1)[:/]/.test(URL_PRUEBAS)) {
  throw new Error('TEST_DATABASE_URL debe apuntar a un Postgres local');
}

const pool = new pg.Pool({ connectionString: URL_PRUEBAS });
const estado = vi.hoisted(() => ({ dbCaida: false, blobs: new Map<string, { cuerpo: string | Blob; tipo?: string }>() }));

// Imita el `sql` de @neondatabase/serverless usando el Postgres local.
vi.mock('@neondatabase/serverless', () => ({
  neon: () => async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    if (estado.dbCaida) throw new Error('fetch failed (simulado)');
    const texto = partes.reduce((acc, p, i) => acc + `$${i}` + p);
    return (await pool.query(texto, valores)).rows;
  },
}));

vi.mock('@vercel/blob', () => ({
  put: async (pathname: string, cuerpo: string | Blob, opciones: { contentType?: string }) => {
    estado.blobs.set(pathname, { cuerpo, tipo: opciones.contentType });
    return { pathname, url: `https://blob.test/${pathname}` };
  },
  get: async (pathname: string) => {
    const b = estado.blobs.get(pathname);
    if (!b) return null;
    return { statusCode: 200, stream: new Response(b.cuerpo).body, blob: { contentType: b.tipo ?? 'application/octet-stream' } };
  },
  list: async ({ prefix }: { prefix: string }) => ({
    blobs: [...estado.blobs.keys()].filter((k) => k.startsWith(prefix)).map((pathname) => ({ pathname })),
    hasMore: false,
  }),
}));

process.env.CRON_SECRET = 'secreto-de-prueba';

const BASE = {
  nombre: 'Ana Pérez',
  poliza: '02-b-123',
  unidad: '',
  correo: 'ANA@example.com',
  telefono: '6000-0000',
  provincia: 'Chiriquí',
  distrito: 'David',
  direccion: 'Calle 1',
  tipoPropiedad: 'Residencial',
  tiposDano: ['fisuras'],
  habitabilidad: 'si',
  riesgos: [] as string[],
  extension: 'puntual',
  operacion: '',
  fechaDano: '2026-10-10',
  descripcion: 'Se abrieron fisuras finas en la pared de la sala.',
  consentimiento: true,
};

function peticion(datos: object, fotos: Blob[] = []) {
  const cuerpo = new FormData();
  cuerpo.append('datos', JSON.stringify(datos));
  fotos.forEach((f) => cuerpo.append('fotos', f, 'f.jpg'));
  return new Request('http://test/api/reclamos', { method: 'POST', body: cuerpo });
}

async function filas() {
  return (await pool.query('SELECT * FROM reclamos_terremoto ORDER BY id')).rows;
}

async function cargarApi() {
  vi.resetModules();
  return {
    reclamos: await import('../api/reclamos'),
    respaldo: await import('../api/respaldo'),
  };
}

beforeAll(async () => {
  await pool.query('DROP TABLE IF EXISTS reclamos_terremoto');
});
afterAll(() => pool.end());
beforeEach(() => {
  estado.dbCaida = false;
  estado.blobs.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('migración', () => {
  it('agrega columnas a una tabla existente sin perder sus filas', async () => {
    // Esquema de la primera versión publicada.
    await pool.query(`
      CREATE TABLE reclamos_terremoto (
        id serial PRIMARY KEY,
        numero text GENERATED ALWAYS AS ('TRM-' || lpad(id::text, 6, '0')) STORED,
        creado_en timestamptz NOT NULL DEFAULT now(),
        estado text NOT NULL DEFAULT 'recibido',
        nombre text NOT NULL, poliza text NOT NULL, unidad text, correo text NOT NULL,
        telefono text NOT NULL, provincia text NOT NULL, distrito text NOT NULL, direccion text NOT NULL,
        tipo_propiedad text NOT NULL, tipos_dano text[] NOT NULL, habitabilidad text NOT NULL,
        fecha_dano date NOT NULL, descripcion text NOT NULL, fotos text[] NOT NULL DEFAULT '{}',
        consentimiento boolean NOT NULL
      )`);
    await pool.query(`
      INSERT INTO reclamos_terremoto (nombre, poliza, correo, telefono, provincia, distrito, direccion,
        tipo_propiedad, tipos_dano, habitabilidad, fecha_dano, descripcion, consentimiento)
      VALUES ('Antiguo', 'P-1', 'a@b.co', '60000000', 'Panamá', 'Panamá', 'x', 'Residencial',
        '{fisuras}', 'si', '2026-10-10', 'reclamo previo a la migración', true)`);

    const { reclamos } = await cargarApi();
    const res = await reclamos.POST(peticion({ ...BASE, ref: crypto.randomUUID() }));
    expect(res.status).toBe(201);
    expect((await res.json()).numero).toBe('TRM-000002');

    const [antiguo, nuevo] = await filas();
    expect(antiguo).toMatchObject({ numero: 'TRM-000001', nombre: 'Antiguo', ref: null, prioridad: 'baja' });
    expect(nuevo).toMatchObject({ nombre: 'Ana Pérez', poliza: '02-B-123', correo: 'ana@example.com', telefono: '60000000' });
  });
});

describe('POST /api/reclamos', () => {
  it('guarda el reclamo con sus fotos y calcula la prioridad', async () => {
    const { reclamos } = await cargarApi();
    const ref = crypto.randomUUID();
    const foto = new Blob(['jpeg'], { type: 'image/jpeg' });
    const res = await reclamos.POST(
      peticion({ ...BASE, ref, tipoPropiedad: 'Industrial', operacion: 'detenida', riesgos: ['electrico'] }, [foto, foto]),
    );
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.prioridad).toBe('alta');

    const fila = (await filas()).find((f) => f.ref === ref);
    expect(fila).toMatchObject({ numero: json.numero, prioridad: 'alta', operacion: 'detenida', riesgos: ['electrico'] });
    expect(fila.fotos).toHaveLength(2);
    fila.fotos.forEach((p: string) => expect(estado.blobs.has(p)).toBe(true));
  });

  it('no duplica si el navegador reenvía el mismo reporte', async () => {
    const { reclamos } = await cargarApi();
    const ref = crypto.randomUUID();
    const a = await (await reclamos.POST(peticion({ ...BASE, ref }))).json();
    const b = await (await reclamos.POST(peticion({ ...BASE, ref }))).json();
    expect(b.numero).toBe(a.numero);
    expect((await filas()).filter((f) => f.ref === ref)).toHaveLength(1);
  });

  it('rechaza datos inválidos sin guardar nada', async () => {
    const { reclamos } = await cargarApi();
    const antes = (await filas()).length;
    const res = await reclamos.POST(peticion({ ...BASE, distrito: 'David', provincia: 'Coclé' }));
    expect(res.status).toBe(400);
    expect((await filas()).length).toBe(antes);
  });

  it('si la base de datos falla, guarda el reclamo en pendientes/', async () => {
    const { reclamos } = await cargarApi();
    estado.dbCaida = true;
    const ref = crypto.randomUUID();
    const res = await reclamos.POST(peticion({ ...BASE, ref }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.numero).toBe(`P-${ref.slice(0, 8).toUpperCase()}`);
    const guardado = JSON.parse(estado.blobs.get(`pendientes/${ref}.json`)!.cuerpo as string);
    expect(guardado).toMatchObject({ ref, nombre: 'Ana Pérez', prioridad: 'baja' });
  }, 10_000);
});

describe('GET /api/respaldo', () => {
  it('exige el secreto del cron', async () => {
    const { respaldo } = await cargarApi();
    const res = await respaldo.GET(new Request('http://test/api/respaldo'));
    expect(res.status).toBe(401);
  });

  it('carga los pendientes una sola vez y copia toda la tabla', async () => {
    const { reclamos, respaldo } = await cargarApi();
    estado.dbCaida = true;
    const ref = crypto.randomUUID();
    await reclamos.POST(peticion({ ...BASE, ref, nombre: 'Pendiente' }));
    estado.dbCaida = false;

    const auth = { headers: { authorization: 'Bearer secreto-de-prueba' } };
    const r1 = await (await respaldo.GET(new Request('http://test/api/respaldo', auth))).json();
    const r2 = await (await respaldo.GET(new Request('http://test/api/respaldo', auth))).json();
    expect(r1.pendientes).toEqual({ cargados: 1, errores: [] });
    expect(r2.pendientes).toEqual({ cargados: 1, errores: [] });

    const todas = await filas();
    expect(todas.filter((f) => f.ref === ref)).toHaveLength(1);
    expect(estado.blobs.has(`pendientes/${ref}.json`)).toBe(true);

    const copia = JSON.parse(estado.blobs.get(r2.respaldo.ruta)!.cuerpo as string);
    expect(copia.total).toBe(todas.length);
    expect(copia.filas.map((f: { numero: string }) => f.numero)).toEqual(todas.map((f) => f.numero));
  }, 10_000);
});

describe('/api/panel', () => {
  process.env.PANEL_CLAVE = 'clave-panel';

  async function sesion() {
    const { panel } = { panel: await import('../api/panel') };
    const res = await panel.POST(new Request('http://test/api/panel', { method: 'POST', body: JSON.stringify({ clave: 'clave-panel' }) }));
    expect(res.status).toBe(204);
    const galleta = res.headers.get('set-cookie')!;
    expect(galleta).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    return { panel, cookie: galleta.split(';')[0] };
  }

  it('rechaza sin sesión o con clave incorrecta', async () => {
    vi.resetModules();
    const panel = await import('../api/panel');
    expect((await panel.GET(new Request('http://test/api/panel'))).status).toBe(401);
    const malo = await panel.POST(new Request('http://test/api/panel', { method: 'POST', body: JSON.stringify({ clave: 'x' }) }));
    expect(malo.status).toBe(401);
    expect((await panel.GET(new Request('http://test/api/panel', { headers: { cookie: 'panel_sesion=9999999999999.falsa' } }))).status).toBe(401);
  });

  it('devuelve los reportes con sus motivos, incluidos los que están en respaldo', async () => {
    vi.resetModules();
    const { reclamos } = await cargarApi();
    estado.dbCaida = true;
    const ref = crypto.randomUUID();
    await reclamos.POST(peticion({ ...BASE, ref, nombre: 'Solo en respaldo', habitabilidad: 'no' }));
    estado.dbCaida = false;

    const { panel, cookie } = await sesion();
    const res = await panel.GET(new Request('http://test/api/panel', { headers: { cookie } }));
    expect(res.status).toBe(200);
    const { reportes } = await res.json();
    expect(reportes.length).toBe((await filas()).length + 1);
    const pendiente = reportes.find((r: { ref: string }) => r.ref === ref);
    expect(pendiente).toMatchObject({ pendiente: true, prioridad: 'alta', motivos: ['no_habitable'] });
    const alta = reportes.find((r: { riesgos: string[]; pendiente: boolean }) => r.riesgos.includes('electrico') && !r.pendiente);
    expect(alta.motivos).toEqual(expect.arrayContaining(['electrico', 'operacion_detenida']));
  }, 10_000);

  it('sirve fotos privadas solo con sesión y rutas válidas', async () => {
    vi.resetModules();
    const { panel, cookie } = await sesion();
    estado.blobs.set('reclamos/2026-10-11/abc/foto-1.jpg', { cuerpo: new Blob(['jpeg']), tipo: 'image/jpeg' });
    const pedir = (ruta: string, c = cookie) =>
      panel.GET(new Request(`http://test/api/panel?foto=${encodeURIComponent(ruta)}`, { headers: { cookie: c } }));
    expect((await pedir('reclamos/2026-10-11/abc/foto-1.jpg', '')).status).toBe(401);
    expect((await pedir('pendientes/x.json')).status).toBe(400);
    expect((await pedir('reclamos/../respaldos/x.jpg')).status).toBe(400);
    expect((await pedir('reclamos/2026-10-11/abc/foto-1.jpg')).status).toBe(200);
  });
});
