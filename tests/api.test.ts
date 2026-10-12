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
    blobs: [...estado.blobs.keys()].filter((k) => k.startsWith(prefix)).map((pathname) => ({ pathname, uploadedAt: new Date() })),
    hasMore: false,
  }),
  head: async (pathname: string) => {
    const b = estado.blobs.get(pathname);
    if (!b) throw new Error('BlobNotFoundError');
    return { pathname, size: typeof b.cuerpo === 'string' ? b.cuerpo.length : b.cuerpo.size, contentType: b.tipo ?? 'application/pdf' };
  },
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
  await pool.query('DROP TABLE IF EXISTS reclamo_eventos');
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
    expect(json.prioridad).toBeUndefined();

    // fisuras (0.2 %) + operación detenida (5 %) = 5.2 % -> media; el riesgo eléctrico no cambia la prioridad.
    const fila = (await filas()).find((f) => f.ref === ref);
    expect(fila).toMatchObject({ numero: json.numero, prioridad: 'media', operacion: 'detenida', riesgos: ['electrico'] });
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
    expect(guardado).toMatchObject({ ref, nombre: 'Ana Pérez', prioridad: 'rapido' });
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
    // Dice "no habitable" con solo una grieta fina: no se respalda -> cierre rápido.
    expect(pendiente).toMatchObject({ pendiente: true, prioridad: 'rapido', costo: 0.2, motivos: ['bajo_deducible', 'habitabilidad_sin_respaldo'] });
    const conRiesgo = reportes.find((r: { riesgos: string[]; pendiente: boolean }) => r.riesgos.includes('electrico') && !r.pendiente);
    expect(conRiesgo).toMatchObject({ prioridad: 'media', costo: 5.2, motivos: ['gasto_medio', 'riesgo_reportado'] });
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

describe('/api/gestion', () => {
  async function preparar() {
    vi.resetModules();
    process.env.PANEL_CLAVE = 'clave-panel';
    const { reclamos } = await cargarApi();
    const panel = await import('../api/panel');
    const gestion = await import('../api/gestion');
    const login = await panel.POST(new Request('http://test/api/panel', { method: 'POST', body: JSON.stringify({ clave: 'clave-panel' }) }));
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    expect(login.headers.get('set-cookie')).toContain('Path=/api;');
    const ref = crypto.randomUUID();
    await reclamos.POST(peticion({ ...BASE, ref }));
    const { id } = (await pool.query('SELECT id FROM reclamos_terremoto WHERE ref = $1', [ref])).rows[0];
    const accion = (cuerpo: object, c = cookie) =>
      gestion.POST(new Request('http://test/api/gestion', { method: 'POST', headers: { cookie: c }, body: JSON.stringify({ id, autor: 'Laura', ...cuerpo }) }));
    const historial = async () => (await (await gestion.GET(new Request(`http://test/api/gestion?id=${id}`, { headers: { cookie } }))).json()).eventos;
    const caso = async () => (await pool.query('SELECT * FROM reclamos_terremoto WHERE id = $1', [id])).rows[0];
    return { panel, gestion, cookie, id, accion, historial, caso };
  }

  it('exige sesión', async () => {
    const { accion, gestion, id } = await preparar();
    expect((await accion({ tipo: 'nota', texto: 'x' }, '')).status).toBe(401);
    expect((await gestion.GET(new Request(`http://test/api/gestion?id=${id}`))).status).toBe(401);
  });

  it('cambia la fase, guarda el historial y detecta cambios simultáneos', async () => {
    const { accion, historial, caso } = await preparar();
    expect((await caso()).estado).toBe('ingresado');
    expect((await accion({ tipo: 'estado', estado: 'en_analisis', estadoAnterior: 'ingresado' })).status).toBe(201);
    // Otra persona intenta cambiar desde la fase vieja: conflicto, no se pisa.
    expect((await accion({ tipo: 'estado', estado: 'esperando_info', estadoAnterior: 'ingresado' })).status).toBe(409);
    expect((await accion({ tipo: 'estado', estado: 'inspeccion_programada', estadoAnterior: 'en_analisis' })).status).toBe(400);
    expect(
      (await accion({ tipo: 'estado', estado: 'con_ajustador', estadoAnterior: 'en_analisis', fechaInspeccion: '2026-10-20' })).status,
    ).toBe(201);
    expect((await accion({ tipo: 'estado', estado: 'declinado', estadoAnterior: 'con_ajustador' })).status).toBe(400);
    expect(
      (await accion({ tipo: 'estado', estado: 'declinado', estadoAnterior: 'con_ajustador', motivoCierre: 'bajo_deducible' })).status,
    ).toBe(201);

    expect(await caso()).toMatchObject({ estado: 'declinado', motivo_cierre: 'bajo_deducible' });
    expect((await caso()).fecha_inspeccion).not.toBeNull();
    expect((await caso()).fase_desde).not.toBeNull();
    const eventos = await historial();
    expect(eventos.map((e: { datos: { a: string } }) => e.datos.a)).toEqual(['en_analisis', 'con_ajustador', 'declinado']);
    expect(eventos[2]).toMatchObject({ autor: 'Laura', tipo: 'estado', datos: { de: 'con_ajustador', motivoCierre: 'bajo_deducible' } });
  });

  it('migra las fases de la primera versión sin perder el historial', async () => {
    const { caso, historial, accion, id } = await preparar();
    await accion({ tipo: 'nota', texto: 'antes de migrar' });
    await pool.query("UPDATE reclamos_terremoto SET estado = 'inspeccion_programada' WHERE id = $1", [id]);
    vi.resetModules();
    const { reclamos } = await cargarApi();
    await reclamos.POST(peticion({ ...BASE, ref: crypto.randomUUID() })); // dispara la migración
    expect((await caso()).estado).toBe('con_ajustador');
    expect((await historial()).map((e: { tipo: string }) => e.tipo)).toEqual(['nota']);
  });

  it('guarda el análisis (causa y coberturas) con control de versión', async () => {
    const { accion, historial, caso, panel, cookie, id } = await preparar();
    const coberturas = [
      { id: 'edificio', reclamado: 5000, reserva: 3500.5, pagado: 0 },
      { id: 'contenido', reclamado: 800, reserva: 600, pagado: 0 },
    ];
    expect((await accion({ tipo: 'analisis', causa: 'sismo', coberturas, version: 0 })).status).toBe(201);
    // Alguien con la versión vieja: conflicto.
    expect((await accion({ tipo: 'analisis', causa: 'agua', coberturas: [], version: 0 })).status).toBe(409);
    expect((await accion({ tipo: 'analisis', causa: 'sismo', coberturas: [{ id: 'inventado', reclamado: 1 }], version: 1 })).status).toBe(400);
    expect((await accion({ tipo: 'analisis', causa: 'sismo', coberturas: [{ id: 'edificio', reclamado: -5 }], version: 1 })).status).toBe(400);
    expect((await caso()).coberturas).toEqual(coberturas);
    expect((await historial()).at(-1)).toMatchObject({ tipo: 'analisis', datos: { causa: 'sismo', coberturas } });

    const { reportes } = await (await panel.GET(new Request('http://test/api/panel', { headers: { cookie } }))).json();
    expect(reportes.find((r: { id: number }) => r.id === id)).toMatchObject({ causa: 'sismo', coberturas, analisisVersion: 1 });
  });

  it('registra documentos ya subidos al caso y los sirve solo con sesión', async () => {
    const { accion, historial, panel, cookie, id } = await preparar();
    const ruta = `documentos/${id}/poliza-abc123.pdf`;
    expect((await accion({ tipo: 'documento', pathname: ruta, nombre: 'Póliza.pdf', tipoDocumento: 'poliza' })).status).toBe(400); // no subido
    estado.blobs.set(ruta, { cuerpo: new Blob(['%PDF-1.4']), tipo: 'application/pdf' });
    expect((await accion({ tipo: 'documento', pathname: `documentos/999999/x.pdf`, nombre: 'x', tipoDocumento: 'poliza' })).status).toBe(400);
    expect((await accion({ tipo: 'documento', pathname: ruta, nombre: 'Póliza.pdf', tipoDocumento: 'inventado' })).status).toBe(400);
    expect((await accion({ tipo: 'documento', pathname: ruta, nombre: 'Póliza.pdf', tipoDocumento: 'poliza', descripcion: 'Vigente' })).status).toBe(201);
    expect((await historial()).at(-1)).toMatchObject({ tipo: 'documento', datos: { pathname: ruta, tipoDocumento: 'poliza', tamano: 8 } });

    const pedir = (c: string) => panel.GET(new Request(`http://test/api/panel?documento=${encodeURIComponent(ruta)}&nombre=P%C3%B3liza.pdf`, { headers: { cookie: c } }));
    expect((await pedir('')).status).toBe(401);
    const res = await pedir(cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const { reportes } = await (await panel.GET(new Request('http://test/api/panel', { headers: { cookie } }))).json();
    expect(reportes.find((r: { id: number }) => r.id === id).documentos).toBe(1);
  });

  it('asigna, registra notas y comunicaciones y el panel lo refleja', async () => {
    const { accion, historial, panel, cookie, id } = await preparar();
    expect((await accion({ tipo: 'asignacion', asignadoA: 'Pedro', asignadoAnterior: '' })).status).toBe(201);
    expect((await accion({ tipo: 'asignacion', asignadoA: 'Ana', asignadoAnterior: '' })).status).toBe(409);
    expect((await accion({ tipo: 'nota', texto: '' })).status).toBe(400);
    expect((await accion({ tipo: 'nota', texto: 'Cliente pide visita en la tarde' })).status).toBe(201);
    expect((await accion({ tipo: 'comunicacion', canal: 'whatsapp', resultado: 'no_contesta' })).status).toBe(201);
    expect((await accion({ tipo: 'comunicacion', canal: 'paloma', resultado: 'contactado' })).status).toBe(400);
    expect((await accion({ tipo: 'comunicacion', canal: 'llamada', resultado: 'contactado', plantilla: 'recepcion', texto: 'Hola' })).status).toBe(201);
    expect((await historial()).map((e: { tipo: string }) => e.tipo)).toEqual(['asignacion', 'nota', 'comunicacion', 'comunicacion']);

    const { reportes } = await (await panel.GET(new Request('http://test/api/panel', { headers: { cookie } }))).json();
    expect(reportes.find((r: { id: number }) => r.id === id)).toMatchObject({ asignadoA: 'Pedro', contactado: true, comunicaciones: 2 });
  });

  it('el respaldo diario incluye el historial de gestión', async () => {
    const { accion } = await preparar();
    await accion({ tipo: 'nota', texto: 'para el respaldo' });
    const respaldo = await import('../api/respaldo');
    const r = await (await respaldo.GET(new Request('http://test/api/respaldo', { headers: { authorization: 'Bearer secreto-de-prueba' } }))).json();
    const copia = JSON.parse(estado.blobs.get(r.respaldo.ruta)!.cuerpo as string);
    expect(copia.eventos.length).toBe(Number((await pool.query('SELECT count(*) FROM reclamo_eventos')).rows[0].count));
    expect(copia.eventos.some((e: { datos: { texto?: string } }) => e.datos.texto === 'para el respaldo')).toBe(true);
  });
});

describe('reportes de corredores y ejecutivos', () => {
  it('exige los datos de quien reporta y permite omitir el contacto del asegurado', async () => {
    const { reclamos } = await cargarApi();
    const corredor = { ...BASE, ref: crypto.randomUUID(), reportadoPor: 'corredor', correo: '', telefono: '' };
    expect((await reclamos.POST(peticion(corredor))).status).toBe(400);
    expect((await reclamos.POST(peticion({ ...corredor, reportanteNombre: 'Seguros XYZ', reportanteCorreo: 'malo' }))).status).toBe(400);
    const ok = await reclamos.POST(
      peticion({ ...corredor, reportanteNombre: 'Seguros XYZ', reportanteCodigo: 'c-123', reportanteCorreo: 'Ana@XYZ.com', reportanteTelefono: '6000-1111' }),
    );
    expect(ok.status).toBe(201);
    const fila = (await filas()).find((f) => f.ref === corredor.ref);
    expect(fila).toMatchObject({
      reportado_por: 'corredor',
      reportante_nombre: 'Seguros XYZ',
      reportante_codigo: 'C-123',
      reportante_correo: 'ana@xyz.com',
      reportante_telefono: '60001111',
      correo: '',
      estado: 'ingresado',
    });
    // Si reporta el asegurado, su contacto sigue siendo obligatorio.
    expect((await reclamos.POST(peticion({ ...BASE, ref: crypto.randomUUID(), correo: '' }))).status).toBe(400);
  });
});

describe('/api/consulta', () => {
  it('muestra la fase solo si coinciden número y póliza', async () => {
    const { reclamos } = await cargarApi();
    const consulta = await import('../api/consulta');
    const ref = crypto.randomUUID();
    const { numero } = await (await reclamos.POST(peticion({ ...BASE, ref }))).json();
    const pedir = (n: string, p: string) => consulta.POST(new Request('http://test/api/consulta', { method: 'POST', body: JSON.stringify({ numero: n, poliza: p }) }));
    expect((await pedir(numero, 'OTRA')).status).toBe(404);
    const res = await pedir(numero.toLowerCase(), BASE.poliza);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ numero, fase: 'ingresado' });
    expect(JSON.stringify(json)).not.toContain('Ana');
  });

  it('encuentra reportes guardados en respaldo con su número P-', async () => {
    const { reclamos } = await cargarApi();
    const consulta = await import('../api/consulta');
    estado.dbCaida = true;
    const { numero } = await (await reclamos.POST(peticion({ ...BASE, ref: crypto.randomUUID() }))).json();
    estado.dbCaida = false;
    const pedir = (p: string) => consulta.POST(new Request('http://test/api/consulta', { method: 'POST', body: JSON.stringify({ numero, poliza: p }) }));
    expect((await pedir('OTRA')).status).toBe(404);
    expect(await (await pedir(BASE.poliza)).json()).toMatchObject({ numero, fase: 'ingresado' });
  }, 10_000);
});
