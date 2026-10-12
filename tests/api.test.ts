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
  copy: async (desde: string, hacia: string) => {
    const b = estado.blobs.get(desde);
    if (!b) throw new Error('BlobNotFoundError');
    estado.blobs.set(hacia, b);
    return { pathname: hacia, url: `https://blob.test/${hacia}` };
  },
  head: async (pathname: string) => {
    const b = estado.blobs.get(pathname);
    if (!b) throw new Error('BlobNotFoundError');
    return { pathname, size: typeof b.cuerpo === 'string' ? b.cuerpo.length : b.cuerpo.size, contentType: b.tipo ?? 'application/pdf' };
  },
}));

process.env.CRON_SECRET = 'secreto-de-prueba';
process.env.SESION_SECRETO = 'secreto-de-sesion-de-prueba-0123456789';
const CLAVE = 'clave-de-prueba-123';

// Crea un usuario con el rol indicado y devuelve su cookie de sesión.
async function entrarComo(rol: string, nombre = `Usuario ${rol}`) {
  const { asegurarTabla } = await import('../api/_db');
  const { hashClave } = await import('../api/_sesion');
  const sesion = await import('../api/sesion');
  await asegurarTabla();
  const correo = `${rol}-${crypto.randomUUID().slice(0, 8)}@prueba.test`;
  const { rows } = await pool.query('INSERT INTO usuarios (nombre, correo, rol, clave_hash) VALUES ($1, $2, $3, $4) RETURNING id', [
    nombre,
    correo,
    rol,
    await hashClave(CLAVE),
  ]);
  const res = await sesion.POST(new Request('http://test/api/sesion', { method: 'POST', body: JSON.stringify({ correo, clave: CLAVE }) }));
  expect(res.status).toBe(204);
  const galleta = res.headers.get('set-cookie')!;
  expect(galleta).toMatch(/Path=\/api; HttpOnly; Secure; SameSite=Strict/);
  return { id: rows[0].id as number, correo, cookie: galleta.split(';')[0] };
}

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
  await pool.query('DROP TABLE IF EXISTS auditoria');
  await pool.query('DROP TABLE IF EXISTS correos_recibidos');
  await pool.query('DROP TABLE IF EXISTS reportes_correo');
  await pool.query('DROP TABLE IF EXISTS limites');
  await pool.query('ALTER TABLE IF EXISTS reclamos_terremoto DROP COLUMN IF EXISTS asignado_usuario_id');
  await pool.query('DROP TABLE IF EXISTS usuarios');
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
  async function sesion() {
    const panel = await import('../api/panel');
    const { cookie } = await entrarComo('supervisor');
    return { panel, cookie };
  }

  it('rechaza sin sesión, con cookie falsa o con clave incorrecta, y bloquea tras 5 intentos', async () => {
    vi.resetModules();
    const panel = await import('../api/panel');
    const sesionApi = await import('../api/sesion');
    expect((await panel.GET(new Request('http://test/api/panel'))).status).toBe(401);
    expect((await panel.GET(new Request('http://test/api/panel', { headers: { cookie: 'panel_sesion=1.9999999999999.falsa' } }))).status).toBe(401);
    const { correo } = await entrarComo('analista');
    const intentar = (clave: string) =>
      sesionApi.POST(new Request('http://test/api/sesion', { method: 'POST', body: JSON.stringify({ correo, clave }) }));
    for (let i = 0; i < 5; i++) expect((await intentar('mala')).status).toBe(401);
    expect((await intentar(CLAVE)).status).toBe(429);
  }, 15_000);

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
    const { reclamos } = await cargarApi();
    const panel = await import('../api/panel');
    const gestion = await import('../api/gestion');
    const { cookie } = await entrarComo('supervisor', 'Laura');
    const ref = crypto.randomUUID();
    await reclamos.POST(peticion({ ...BASE, ref }));
    const { id } = (await pool.query('SELECT id FROM reclamos_terremoto WHERE ref = $1', [ref])).rows[0];
    const accion = (cuerpo: object, c = cookie) =>
      gestion.POST(new Request('http://test/api/gestion', { method: 'POST', headers: { cookie: c }, body: JSON.stringify({ id, autor: 'Nombre falso', ...cuerpo }) }));
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
    const pedro = await entrarComo('analista', 'Pedro');
    const ana = await entrarComo('analista', 'Ana');
    const comercial = await entrarComo('comercial', 'Comercial');
    expect((await accion({ tipo: 'asignacion', asignadoUsuarioId: comercial.id, asignadoAnterior: null })).status).toBe(400);
    expect((await accion({ tipo: 'asignacion', asignadoUsuarioId: pedro.id, asignadoAnterior: null })).status).toBe(201);
    expect((await accion({ tipo: 'asignacion', asignadoUsuarioId: ana.id, asignadoAnterior: null })).status).toBe(409);
    expect((await accion({ tipo: 'nota', texto: '' })).status).toBe(400);
    expect((await accion({ tipo: 'nota', texto: 'Cliente pide visita en la tarde' })).status).toBe(201);
    expect((await accion({ tipo: 'comunicacion', canal: 'whatsapp', resultado: 'no_contesta' })).status).toBe(201);
    expect((await accion({ tipo: 'comunicacion', canal: 'paloma', resultado: 'contactado' })).status).toBe(400);
    expect((await accion({ tipo: 'comunicacion', canal: 'llamada', resultado: 'contactado', plantilla: 'recepcion', texto: 'Hola' })).status).toBe(201);
    expect((await historial()).map((e: { tipo: string }) => e.tipo)).toEqual(['asignacion', 'nota', 'comunicacion', 'comunicacion']);

    const { reportes } = await (await panel.GET(new Request('http://test/api/panel', { headers: { cookie } }))).json();
    expect(reportes.find((r: { id: number }) => r.id === id)).toMatchObject({
      asignadoA: 'Pedro',
      asignadoUsuarioId: pedro.id,
      contactado: true,
      comunicaciones: 2,
    });
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

describe('roles y permisos', () => {
  async function dosCasos() {
    vi.resetModules();
    const { reclamos } = await cargarApi();
    const ids: number[] = [];
    for (const poliza of ['POL-ASIGNADA', 'POL-AJENA']) {
      const ref = crypto.randomUUID();
      await reclamos.POST(peticion({ ...BASE, ref, poliza }));
      ids.push((await pool.query('SELECT id FROM reclamos_terremoto WHERE ref = $1', [ref])).rows[0].id);
    }
    return ids;
  }
  const accion = async (cookie: string, id: number, cuerpo: object) =>
    (await import('../api/gestion')).POST(new Request('http://test/api/gestion', { method: 'POST', headers: { cookie }, body: JSON.stringify({ id, ...cuerpo }) }));

  it('el ajustador externo solo ve y trabaja sus casos, sin costos', async () => {
    const [asignado, ajeno] = await dosCasos();
    const sup = await entrarComo('supervisor');
    const aj = await entrarComo('ajustador', 'Ajustadora Global');
    expect((await accion(sup.cookie, asignado, { tipo: 'asignacion', asignadoUsuarioId: aj.id, asignadoAnterior: null })).status).toBe(201);

    const panel = await import('../api/panel');
    const { reportes } = await (await panel.GET(new Request('http://test/api/panel', { headers: { cookie: aj.cookie } }))).json();
    expect(reportes.map((r: { id: number }) => r.id)).toEqual([asignado]);
    expect(reportes[0]).toMatchObject({ costo: null, motivos: [] });

    expect((await accion(aj.cookie, asignado, { tipo: 'nota', texto: 'Inspección realizada' })).status).toBe(201);
    expect((await accion(aj.cookie, ajeno, { tipo: 'nota', texto: 'no debería' })).status).toBe(403);
    expect((await accion(aj.cookie, asignado, { tipo: 'estado', estado: 'pagado', estadoAnterior: 'ingresado' })).status).toBe(403);
    expect((await accion(aj.cookie, asignado, { tipo: 'comunicacion', canal: 'llamada', resultado: 'contactado' })).status).toBe(403);
    const gestion = await import('../api/gestion');
    expect((await gestion.GET(new Request(`http://test/api/gestion?id=${ajeno}`, { headers: { cookie: aj.cookie } }))).status).toBe(403);
    const eventos = (await (await gestion.GET(new Request(`http://test/api/gestion?id=${asignado}`, { headers: { cookie: aj.cookie } }))).json()).eventos;
    expect(eventos.at(-1)).toMatchObject({ autor: 'Ajustadora Global', tipo: 'nota' });

    const ruta = `documentos/${ajeno}/x.pdf`;
    estado.blobs.set(ruta, { cuerpo: new Blob(['%PDF']), tipo: 'application/pdf' });
    expect((await panel.GET(new Request(`http://test/api/panel?documento=${ruta}`, { headers: { cookie: aj.cookie } }))).status).toBe(403);
    const auditoria = await pool.query("SELECT accion FROM auditoria WHERE usuario_id = $1 AND accion = 'ver_caso'", [aj.id]);
    expect(auditoria.rowCount).toBe(1);
  });

  it('comercial solo lee y canales solo comunica', async () => {
    const [id] = await dosCasos();
    const com = await entrarComo('comercial');
    const can = await entrarComo('canales');
    const panel = await import('../api/panel');
    const res = await panel.GET(new Request('http://test/api/panel', { headers: { cookie: com.cookie } }));
    expect(res.status).toBe(200);
    expect((await res.json()).reportes.find((r: { id: number }) => r.id === id).costo).not.toBeNull();
    expect((await accion(com.cookie, id, { tipo: 'nota', texto: 'x' })).status).toBe(403);
    expect((await accion(can.cookie, id, { tipo: 'comunicacion', canal: 'whatsapp', resultado: 'mensaje_enviado' })).status).toBe(201);
    expect((await accion(can.cookie, id, { tipo: 'analisis', causa: 'sismo', coberturas: [], version: 0 })).status).toBe(403);
    expect((await accion(can.cookie, id, { tipo: 'estado', estado: 'en_analisis', estadoAnterior: 'ingresado' })).status).toBe(403);
  });

  it('el supervisor administra usuarios; desactivar corta la sesión', async () => {
    vi.resetModules();
    const usuarios = await import('../api/usuarios');
    const sesion = await import('../api/sesion');
    const sup = await entrarComo('supervisor');
    const ana = await entrarComo('analista');
    const crear = (cookie: string, cuerpo: object) =>
      usuarios.POST(new Request('http://test/api/usuarios', { method: 'POST', headers: { cookie }, body: JSON.stringify(cuerpo) }));
    expect((await crear(ana.cookie, { nombre: 'X', correo: 'x@prueba.test', rol: 'analista' })).status).toBe(403);
    const res = await crear(sup.cookie, { nombre: 'Nuevo Analista', correo: 'Nuevo@Prueba.test', rol: 'analista' });
    expect(res.status).toBe(201);
    const { id, claveTemporal } = await res.json();
    expect(claveTemporal).toHaveLength(14);
    expect((await crear(sup.cookie, { nombre: 'Otro', correo: 'nuevo@prueba.test', rol: 'analista' })).status).toBe(409);

    const login = await sesion.POST(new Request('http://test/api/sesion', { method: 'POST', body: JSON.stringify({ correo: 'nuevo@prueba.test', clave: claveTemporal }) }));
    expect(login.status).toBe(204);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const yo = await (await sesion.GET(new Request('http://test/api/sesion', { headers: { cookie } }))).json();
    expect(yo).toMatchObject({ usuario: { nombre: 'Nuevo Analista', rol: 'analista' }, permisos: { verBI: false, cambiarFase: true } });

    const cambiar = (cuerpo: object) =>
      usuarios.PATCH(new Request('http://test/api/usuarios', { method: 'PATCH', headers: { cookie: sup.cookie }, body: JSON.stringify(cuerpo) }));
    expect((await cambiar({ id: sup.id, accion: 'desactivar' })).status).toBe(400);
    expect((await cambiar({ id, accion: 'desactivar' })).status).toBe(200);
    expect((await sesion.GET(new Request('http://test/api/sesion', { headers: { cookie } }))).status).toBe(401);
    const nueva = await (await cambiar({ id, accion: 'restablecer' })).json();
    expect(nueva.claveTemporal).toHaveLength(14);

    // Cambio de la propia clave.
    const patch = (cuerpo: object) => sesion.PATCH(new Request('http://test/api/sesion', { method: 'PATCH', headers: { cookie: ana.cookie }, body: JSON.stringify(cuerpo) }));
    expect((await patch({ claveActual: 'mala', claveNueva: 'una-clave-larga' })).status).toBe(400);
    expect((await patch({ claveActual: CLAVE, claveNueva: 'corta' })).status).toBe(400);
    expect((await patch({ claveActual: CLAVE, claveNueva: 'una-clave-larga' })).status).toBe(204);
  });
});

describe('/api/polizas (conector simulado)', () => {
  it('devuelve datos coherentes y documentos de la póliza', async () => {
    vi.resetModules();
    const polizas = await import('../api/polizas');
    const sup = await entrarComo('supervisor');
    const pedir = (q: string, cookie = sup.cookie) => polizas.GET(new Request(`http://test/api/polizas?${q}`, { headers: { cookie } }));
    expect((await pedir('numero=02-B-123', '')).status).toBe(401);
    const a = await (await pedir('numero=02-b-123')).json();
    const b = await (await pedir('numero=02-B-123')).json();
    expect(a).toEqual(b); // determinista
    expect(a.fuente).toBe('simulado');
    expect(a.poliza).toMatchObject({ numero: '02-B-123', moneda: 'USD' });
    expect(a.poliza.coberturas.length).toBeGreaterThan(2);
    expect(a.poliza.coberturas.every((c: { sumaAsegurada: number }) => c.sumaAsegurada > 0)).toBe(true);
    expect((await pedir('numero=NOEXISTE-1')).status).toBe(404);

    const doc = await pedir(`numero=02-B-123&documento=${a.poliza.documentos[0].id}`);
    expect(doc.status).toBe(200);
    expect(doc.headers.get('content-type')).toBe('application/pdf');
    expect((await doc.text()).startsWith('%PDF-1.4')).toBe(true);
  });

  it('el ajustador solo consulta pólizas de sus casos', async () => {
    vi.resetModules();
    const { reclamos } = await cargarApi();
    const polizas = await import('../api/polizas');
    const ref = crypto.randomUUID();
    await reclamos.POST(peticion({ ...BASE, ref, poliza: 'POL-AJ-1' }));
    const { id } = (await pool.query('SELECT id FROM reclamos_terremoto WHERE ref = $1', [ref])).rows[0];
    const aj = await entrarComo('ajustador');
    await pool.query('UPDATE reclamos_terremoto SET asignado_usuario_id = $1 WHERE id = $2', [aj.id, id]);
    const pedir = (n: string) => polizas.GET(new Request(`http://test/api/polizas?numero=${n}`, { headers: { cookie: aj.cookie } }));
    expect((await pedir('pol-aj-1')).status).toBe(200);
    expect((await pedir('OTRA-POLIZA')).status).toBe(403);
  });
});

describe('sesión con la cookie antigua del panel', () => {
  it('entra aunque el navegador envíe primero la cookie de la primera versión, y la borra', async () => {
    vi.resetModules();
    const panel = await import('../api/panel');
    const sesionApi = await import('../api/sesion');
    const { correo, cookie } = await entrarComo('supervisor');
    // Cookie de la primera versión (Path=/api/panel): "vence.firma", llega antes que la actual.
    const antigua = `panel_sesion=${Date.now() + 3_600_000}.firmaDeLaClaveCompartida`;
    const res = await panel.GET(new Request('http://test/api/panel', { headers: { cookie: `${antigua}; ${cookie}` } }));
    expect(res.status).toBe(200);

    const login = await sesionApi.POST(new Request('http://test/api/sesion', { method: 'POST', body: JSON.stringify({ correo, clave: CLAVE }) }));
    const cookies = login.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[1]).toMatch(/^panel_sesion=; Path=\/api\/panel;.*Max-Age=0/);
  });
});

describe('correo (conector simulado y Microsoft 365)', () => {
  async function preparar(rol = 'supervisor', datos: object = {}) {
    vi.resetModules();
    const { reclamos } = await cargarApi();
    const panel = await import('../api/panel');
    const gestion = await import('../api/gestion');
    const correoApi = await import('../api/correo');
    const usuario = await entrarComo(rol, 'Marta');
    const ref = crypto.randomUUID();
    await reclamos.POST(peticion({ ...BASE, ref, ...datos }));
    const { id, numero } = (await pool.query('SELECT id, numero FROM reclamos_terremoto WHERE ref = $1', [ref])).rows[0];
    const accion = (cuerpo: object, c = usuario.cookie) =>
      gestion.POST(new Request('http://test/api/gestion', { method: 'POST', headers: { cookie: c }, body: JSON.stringify({ id, ...cuerpo }) }));
    const correo = (cuerpo: object, c = usuario.cookie) =>
      correoApi.POST(new Request('http://test/api/correo', { method: 'POST', headers: { cookie: c }, body: JSON.stringify(cuerpo) }));
    const eventos = async () => (await pool.query('SELECT * FROM reclamo_eventos WHERE reclamo_id = $1 ORDER BY id', [id])).rows;
    const reporte = async () => {
      const json = await (await panel.GET(new Request('http://test/api/panel', { headers: { cookie: usuario.cookie } }))).json();
      return json.reportes.find((r: { id: number }) => r.id === id);
    };
    return { id, numero: numero as string, usuario, accion, correo, eventos, reporte };
  }

  it('reconoce el número del reclamo en el asunto', async () => {
    const { numeroEnAsunto } = await import('../api/_correo');
    expect(numeroEnAsunto('RE: ASSA · Recibimos su reporte TRM-000123')).toBe(123);
    expect(numeroEnAsunto('rv: trm 45 fotos')).toBe(45);
    expect(numeroEnAsunto('Consulta sobre mi póliza')).toBeNull();
    expect(numeroEnAsunto('ATRM-000123')).toBeNull();
  });

  it('en modo simulado registra el envío con el número en el asunto y la dirección del caso', async () => {
    const { accion, eventos, numero, reporte } = await preparar();
    const res = await accion({ tipo: 'correo', destinatario: 'asegurado', asunto: 'Seguimiento', texto: 'Hola, Ana.', plantilla: 'documentos', para: 'otro@x.com' });
    expect(res.status).toBe(201);
    const [e] = await eventos();
    expect(e).toMatchObject({
      autor: 'Marta',
      tipo: 'comunicacion',
      datos: { canal: 'correo', resultado: 'mensaje_enviado', direccion: 'saliente', envio: 'simulado', para: 'ana@example.com', asunto: `Seguimiento · ${numero}` },
    });
    expect((await reporte()).comunicaciones).toBe(1);
    expect((await accion({ tipo: 'correo', destinatario: 'asegurado', asunto: '', texto: 'x' })).status).toBe(400);
    // El asegurado reportó: no hay "reportante" a quien escribir.
    expect((await accion({ tipo: 'correo', destinatario: 'reportante', asunto: 'a', texto: 'x' })).status).toBe(400);
  });

  it('no envía si el contacto no tiene correo, y solo quien comunica puede enviar', async () => {
    const corredor = {
      reportadoPor: 'corredor',
      reportanteNombre: 'Corredora López',
      reportanteCodigo: 'C-1',
      reportanteCorreo: 'corredora@ejemplo.com',
      reportanteTelefono: '6111-1111',
      correo: '',
      telefono: '',
    };
    const { accion, eventos, id } = await preparar('canales', corredor);
    expect((await accion({ tipo: 'correo', destinatario: 'asegurado', asunto: 'a', texto: 'x' })).status).toBe(400);
    expect((await accion({ tipo: 'correo', destinatario: 'reportante', asunto: 'a', texto: 'x' })).status).toBe(201);
    expect((await eventos())[0].datos).toMatchObject({ para: 'corredora@ejemplo.com', destinatario: 'Corredora López' });

    const comercial = await entrarComo('comercial');
    const ajustador = await entrarComo('ajustador');
    await pool.query('UPDATE reclamos_terremoto SET asignado_usuario_id = $1 WHERE id = $2', [ajustador.id, id]);
    for (const c of [comercial.cookie, ajustador.cookie]) {
      expect((await accion({ tipo: 'correo', destinatario: 'reportante', asunto: 'a', texto: 'x' }, c)).status).toBe(403);
    }
  });

  it('el correo entrante simulado se asocia al caso, deja el adjunto y avisa hasta que se ve', async () => {
    const { id, accion, correo, eventos, reporte } = await preparar();
    const res = await correo({ accion: 'simular', id });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ estado: 'asociado', reclamoId: id, adjuntos: 1 });

    const [comunicacion, documento] = await eventos();
    expect(comunicacion).toMatchObject({
      autor: 'Ana Pérez',
      tipo: 'comunicacion',
      datos: { canal: 'correo', resultado: 'respuesta_recibida', direccion: 'entrante', de: 'ana@example.com', adjuntos: ['presupuesto-simulado.pdf'] },
    });
    expect(documento).toMatchObject({ tipo: 'documento', datos: { tipoDocumento: 'correo', nombre: 'presupuesto-simulado.pdf' } });
    expect(documento.datos.pathname).toMatch(new RegExp(`^documentos/${id}/`));
    expect(estado.blobs.has(documento.datos.pathname)).toBe(true);

    const r = await reporte();
    expect(r).toMatchObject({ correoNuevo: true, contactado: true, documentos: 1 });
    expect((await accion({ tipo: 'correo_leido' })).status).toBe(200);
    expect((await reporte()).correoNuevo).toBe(false);
  });

  it('no registra dos veces el mismo mensaje y guarda los que no traen número', async () => {
    const { id, numero, eventos } = await preparar();
    const { procesarEntrante } = await import('../api/_correo');
    const mensaje = { mensajeId: 'm-1', de: 'a@b.co', deNombre: '', asunto: `RE: ${numero}`, texto: 'hola', recibidoEn: new Date().toISOString(), adjuntos: [] };
    expect(await procesarEntrante(mensaje, 'simulado')).toMatchObject({ estado: 'asociado', reclamoId: id });
    expect(await procesarEntrante(mensaje, 'simulado')).toMatchObject({ estado: 'duplicado' });
    expect(await eventos()).toHaveLength(1);

    expect(await procesarEntrante({ ...mensaje, mensajeId: 'm-2', asunto: 'Consulta general' }, 'simulado')).toMatchObject({ estado: 'sin_asociar' });
    expect(await procesarEntrante({ ...mensaje, mensajeId: 'm-3', asunto: 'TRM-999999' }, 'simulado')).toMatchObject({ estado: 'sin_asociar' });
    const sinCaso = (await pool.query("SELECT * FROM correos_recibidos WHERE mensaje_id IN ('m-2', 'm-3')")).rows;
    expect(sinCaso).toHaveLength(2);
    expect(sinCaso.every((c) => c.reclamo_id === null && c.datos.texto === 'hola')).toBe(true);
  });

  it('la bandeja de correos sin caso permite asociarlos o descartarlos, sin borrar nada', async () => {
    const { id, numero, correo, eventos, usuario } = await preparar();
    const correoApi = await import('../api/correo');
    const ver = (q: string, c = usuario.cookie) => correoApi.GET(new Request(`http://test/api/correo?${q}`, { headers: { cookie: c } }));

    // Dos correos sin número (simulados) con su adjunto guardado en correos/.
    for (let i = 0; i < 2; i++) expect(await (await correo({ accion: 'simular' })).json()).toMatchObject({ estado: 'sin_asociar', adjuntos: 1 });
    const inicio = await (await ver('')).json();
    expect(inicio).toMatchObject({ proveedor: 'simulado' });
    expect(inicio.sinAsociar).toBeGreaterThanOrEqual(2);
    const pendientes = (await (await ver('bandeja=1')).json()).correos.filter((c: { estado: string }) => c.estado === 'pendiente');
    const [a, b] = pendientes.slice(-2);
    expect(a).toMatchObject({ asunto: 'Consulta sobre mi reclamo por el sismo', de: 'carlos.rios@ejemplo.com' });
    expect(a.adjuntos[0].pathname).toMatch(/^correos\//);
    const adjunto = await ver(`adjunto=${encodeURIComponent(a.adjuntos[0].pathname)}`);
    expect(adjunto.status).toBe(200);
    expect((await adjunto.text()).startsWith('%PDF')).toBe(true);
    expect((await ver('adjunto=documentos/1/x.pdf')).status).toBe(400);

    // Asociar: el correo y su adjunto pasan al caso.
    expect((await correo({ accion: 'asociar', mensajeId: a.mensajeId, numero: 'TRM-999999' })).status).toBe(404);
    expect((await correo({ accion: 'asociar', mensajeId: a.mensajeId, numero: 'hola' })).status).toBe(400);
    const res = await correo({ accion: 'asociar', mensajeId: a.mensajeId, numero: numero.toLowerCase() });
    expect(await res.json()).toMatchObject({ ok: true, numero, adjuntos: 1 });
    const ev = await eventos();
    expect(ev.map((e) => e.tipo)).toEqual(['comunicacion', 'documento']);
    expect(ev[0].datos).toMatchObject({ direccion: 'entrante', asociadoPor: 'Marta', de: 'carlos.rios@ejemplo.com' });
    expect(ev[1].datos.pathname).toMatch(new RegExp(`^documentos/${id}/`));
    expect(estado.blobs.has(ev[1].datos.pathname)).toBe(true);
    expect(estado.blobs.has(a.adjuntos[0].pathname)).toBe(true); // el original se conserva
    expect((await pool.query('SELECT correo_nuevo FROM reclamos_terremoto WHERE id = $1', [id])).rows[0].correo_nuevo).toBe(true);
    // Otra persona intenta asociarlo de nuevo: conflicto.
    expect((await correo({ accion: 'asociar', mensajeId: a.mensajeId, numero })).status).toBe(409);

    // Descartar: deja de estar pendiente, pero el correo sigue guardado.
    expect((await correo({ accion: 'descartar', mensajeId: b.mensajeId })).status).toBe(200);
    expect((await correo({ accion: 'descartar', mensajeId: b.mensajeId })).status).toBe(409);
    const fila = (await pool.query('SELECT * FROM correos_recibidos WHERE mensaje_id = $1', [b.mensajeId])).rows[0];
    expect(fila).toMatchObject({ reclamo_id: null, gestionado_por: 'Marta' });
    expect(fila.descartado_en).not.toBeNull();
    const despues = (await (await ver('bandeja=1')).json()).correos;
    expect(despues.find((c: { mensajeId: string }) => c.mensajeId === a.mensajeId)).toMatchObject({ estado: 'asociado', numero });
    expect(despues.find((c: { mensajeId: string }) => c.mensajeId === b.mensajeId)).toMatchObject({ estado: 'descartado' });

    // Solo quien ve todos los reclamos y comunica usa la bandeja.
    const comercial = await entrarComo('comercial');
    const ajustador = await entrarComo('ajustador');
    for (const c of [comercial.cookie, ajustador.cookie]) {
      expect((await ver('bandeja=1', c)).status).toBe(403);
      expect((await correo({ accion: 'descartar', mensajeId: 'x' }, c)).status).toBe(403);
    }
    expect((await ver('', comercial.cookie)).status).toBe(200);
    expect((await (await ver('', comercial.cookie)).json()).sinAsociar).toBe(0);
  });

  it('con Microsoft 365 envía por Graph y sincroniza el buzón, sin perder los que fallan', async () => {
    const { id, numero, accion, correo, eventos } = await preparar();
    Object.assign(process.env, {
      CORREO_PROVEEDOR: 'microsoft365',
      M365_TENANT_ID: 'tenant',
      M365_CLIENT_ID: 'cliente',
      M365_CLIENT_SECRET: 'secreto',
      M365_BUZON: 'reclamos@assa.test',
    });
    const llamadas: { url: string; metodo: string; cuerpo: string }[] = [];
    const pdf = Buffer.from('%PDF-1.4 prueba').toString('base64');
    const fetchFalso = vi.fn(async (url: string, init: RequestInit = {}) => {
      llamadas.push({ url, metodo: init.method ?? 'GET', cuerpo: String(init.body ?? '') });
      if (url.includes('/oauth2/v2.0/token')) return Response.json({ access_token: 'tok', expires_in: 3600 });
      if (url.endsWith('/sendMail')) return new Response(null, { status: 202 });
      if (url.includes('/mailFolders/inbox/messages'))
        return Response.json({
          value: [
            { id: 'g-1', subject: `RE: ${numero}`, receivedDateTime: '2026-10-12T10:00:00Z', from: { emailAddress: { address: 'ana@example.com', name: 'Ana' } }, body: { content: 'Adjunto fotos' }, hasAttachments: true },
            { id: 'g-2', subject: 'Sin número', receivedDateTime: '2026-10-12T10:01:00Z', from: { emailAddress: { address: 'x@y.com', name: 'X' } }, body: { content: 'Hola' }, hasAttachments: false },
          ],
        });
      if (url.includes('/attachments'))
        return Response.json({
          value: [
            { '@odata.type': '#microsoft.graph.fileAttachment', name: 'fotos.pdf', contentType: 'application/pdf', size: 10, isInline: false, contentBytes: pdf },
            { '@odata.type': '#microsoft.graph.fileAttachment', name: 'firma.png', contentType: 'image/png', size: 10, isInline: true, contentBytes: pdf },
          ],
        });
      if (init.method === 'PATCH') return Response.json({});
      return new Response('no encontrado', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchFalso);
    try {
      expect((await accion({ tipo: 'correo', destinatario: 'asegurado', asunto: `Hola ${numero}`, texto: 'Mensaje' })).status).toBe(201);
      const envio = llamadas.find((l) => l.url.endsWith('/sendMail'))!;
      expect(envio.url).toBe('https://graph.microsoft.com/v1.0/users/reclamos%40assa.test/sendMail');
      expect(JSON.parse(envio.cuerpo).message).toMatchObject({
        subject: `Hola ${numero}`,
        toRecipients: [{ emailAddress: { address: 'ana@example.com' } }],
      });
      expect((await eventos())[0].datos).toMatchObject({ envio: 'microsoft365', direccion: 'saliente' });

      // Simular solo existe en modo simulado.
      expect((await correo({ accion: 'simular', id })).status).toBe(400);

      const res = await correo({ accion: 'sincronizar' });
      expect(await res.json()).toEqual({ leidos: 2, asociados: 1, creados: 0, incompletos: 0, sinAsociar: 1, errores: 0 });
      expect(llamadas.filter((l) => l.metodo === 'PATCH').map((l) => l.url.split('/messages/')[1])).toEqual(['g-1', 'g-2']);
      const ev = await eventos();
      expect(ev.map((e) => e.tipo)).toEqual(['comunicacion', 'comunicacion', 'documento']);
      expect(ev[2].datos.nombre).toBe('fotos.pdf'); // la imagen de la firma no se guarda
      // Una segunda lectura inmediata se omite (máximo una por minuto).
      expect(await (await correo({ accion: 'sincronizar' })).json()).toEqual({ omitido: true });

      // Si guardar falla, el correo no se marca como leído y se reintenta después.
      llamadas.length = 0;
      estado.dbCaida = true;
      const { sincronizarBuzon } = await import('../api/_correo');
      expect(await sincronizarBuzon()).toMatchObject({ errores: 2 });
      expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(false);

      // Si Graph no responde, el envío no queda registrado como hecho.
      estado.dbCaida = false;
      fetchFalso.mockImplementation(async () => new Response('caído', { status: 503 }));
      const antes = (await eventos()).length;
      expect((await accion({ tipo: 'correo', destinatario: 'asegurado', asunto: 'x', texto: 'y' })).status).toBe(502);
      expect(await eventos()).toHaveLength(antes);
    } finally {
      vi.unstubAllGlobals();
      for (const k of ['CORREO_PROVEEDOR', 'M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'M365_BUZON']) delete process.env[k];
    }
  });
});

describe('límite de solicitudes', () => {
  const desde = (ip: string, url: string, init: RequestInit) => new Request(url, { ...init, headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } });

  it('frena la consulta pública desde una IP que abusa, sin afectar a las demás', async () => {
    const { reclamos } = await cargarApi();
    const consulta = await import('../api/consulta');
    const { LIMITES } = await import('../api/_limites');
    const ref = crypto.randomUUID();
    const { numero } = await (await reclamos.POST(peticion({ ...BASE, ref }))).json();
    const pedir = (ip: string) =>
      consulta.POST(desde(ip, 'http://test/api/consulta', { method: 'POST', body: JSON.stringify({ numero, poliza: BASE.poliza }) }));
    expect((await pedir('200.1.1.1')).status).toBe(200);
    // La misma IP llega al máximo de la ventana.
    await pool.query('UPDATE limites SET conteo = $1', [LIMITES.consulta.maximo]);
    const frenada = await pedir('200.1.1.1');
    expect(frenada.status).toBe(429);
    expect(frenada.headers.get('retry-after')).toBe('600');
    expect((await pedir('200.2.2.2')).status).toBe(200);
    // No se guarda la IP, solo un resumen.
    const claves = (await pool.query('SELECT clave FROM limites')).rows.map((f) => f.clave);
    expect(claves.join()).not.toContain('200.1.1.1');
  });

  it('frena el formulario con un mensaje claro, y si la base de datos falla deja pasar el reporte', async () => {
    const { reclamos } = await cargarApi();
    const { LIMITES } = await import('../api/_limites');
    const enviar = (ip: string) => {
      const cuerpo = new FormData();
      cuerpo.append('datos', JSON.stringify({ ...BASE, ref: crypto.randomUUID() }));
      return reclamos.POST(desde(ip, 'http://test/api/reclamos', { method: 'POST', body: cuerpo }));
    };
    expect((await enviar('201.1.1.1')).status).toBe(201);
    await pool.query("UPDATE limites SET conteo = $1 WHERE clave LIKE 'reclamo:%'", [LIMITES.reclamo.maximo]);
    const res = await enviar('201.1.1.1');
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/siguen en este formulario/);

    // La prueba de carga omite el límite solo en el ambiente de pruebas y con su secreto.
    const conClave = (clave: string) => {
      const cuerpo = new FormData();
      cuerpo.append('datos', JSON.stringify({ ...BASE, ref: crypto.randomUUID() }));
      return reclamos.POST(new Request('http://test/api/reclamos', { method: 'POST', body: cuerpo, headers: { 'x-forwarded-for': '201.1.1.1', 'x-prueba-carga': clave } }));
    };
    expect((await conClave('secreto-de-prueba')).status).toBe(429); // sin AMBIENTE=pruebas (producción)
    process.env.AMBIENTE = 'pruebas';
    try {
      expect((await conClave('otra-clave')).status).toBe(429);
      expect((await conClave('secreto-de-prueba')).status).toBe(201);
    } finally {
      delete process.env.AMBIENTE;
    }

    estado.dbCaida = true;
    const respaldo = await enviar('201.1.1.1');
    expect(respaldo.status).toBe(201);
    expect((await respaldo.json()).numero).toMatch(/^P-/);
  }, 10_000);
});

describe('/api/salud', () => {
  it('informa el estado; el detalle solo con el secreto del cron o un supervisor', async () => {
    vi.resetModules();
    const { reclamos } = await cargarApi();
    const salud = await import('../api/salud');
    const pedir = async (headers: Record<string, string> = {}) => {
      const res = await salud.GET(new Request('http://test/api/salud', { headers }));
      return { status: res.status, json: await res.json() };
    };

    // Sin respaldo diario todavía: degradado.
    let r = await pedir();
    expect(r).toMatchObject({ status: 200, json: { estado: 'degradado' } });
    expect(r.json.revisiones).toBeUndefined();

    estado.blobs.set(`respaldos/${new Date().toISOString().slice(0, 10)}.json`, { cuerpo: '{}' });
    r = await pedir({ authorization: 'Bearer secreto-de-prueba' });
    expect(r).toMatchObject({ status: 200, json: { estado: 'ok' } });
    expect(r.json.revisiones.baseDeDatos.ok).toBe(true);
    expect(r.json.revisiones.correo.detalle).toMatch(/^simulado · \d+ correos sin caso$/);

    // Un reporte en respaldo que aún no está en la tabla: degradado, con el detalle.
    estado.dbCaida = true;
    await reclamos.POST(peticion({ ...BASE, ref: crypto.randomUUID() }));
    r = await pedir({ authorization: 'Bearer secreto-de-prueba' });
    expect(r.status).toBe(503);
    expect(r.json).toMatchObject({ estado: 'caido', revisiones: { baseDeDatos: { ok: false } } });
    estado.dbCaida = false;
    r = await pedir({ authorization: 'Bearer secreto-de-prueba' });
    expect(r.json).toMatchObject({ estado: 'degradado', revisiones: { pendientes: { ok: false, detalle: expect.stringMatching(/^1 reportes en respaldo/) } } });

    // Un supervisor ve el detalle; otros roles, no.
    const sup = await entrarComo('supervisor');
    const com = await entrarComo('comercial');
    expect((await pedir({ cookie: sup.cookie })).json.revisiones).toBeDefined();
    expect((await pedir({ cookie: com.cookie })).json.revisiones).toBeUndefined();
  }, 15_000);
});

describe('carga', () => {
  it('200 reportes simultáneos (con reenvíos) quedan todos, una sola vez y con números únicos', async () => {
    const { reclamos } = await cargarApi();
    const refs = Array.from({ length: 200 }, () => crypto.randomUUID());
    // Cada décimo reporte se reenvía al mismo tiempo (doble clic, red lenta).
    const envios = [...refs, ...refs.filter((_, i) => i % 10 === 0)].map((ref, i) => {
      const cuerpo = new FormData();
      cuerpo.append('datos', JSON.stringify({ ...BASE, ref }));
      return reclamos.POST(
        new Request('http://test/api/reclamos', { method: 'POST', body: cuerpo, headers: { 'x-forwarded-for': `190.0.${i % 250}.${i % 7}` } }),
      );
    });
    const respuestas = await Promise.all(envios);
    expect(respuestas.every((r) => r.status === 201)).toBe(true);
    const numeros = await Promise.all(respuestas.map((r) => r.json().then((j) => j.numero as string)));
    expect(numeros.every((n) => /^TRM-\d{6}$/.test(n))).toBe(true);
    const { rows } = await pool.query('SELECT ref, numero FROM reclamos_terremoto WHERE ref = ANY($1)', [refs]);
    expect(rows).toHaveLength(200);
    expect(new Set(rows.map((f) => f.numero)).size).toBe(200);
    // El reenvío recibe el mismo número que el original.
    const porRef = new Map(rows.map((f) => [f.ref, f.numero]));
    expect(numeros.slice(200)).toEqual(refs.filter((_, i) => i % 10 === 0).map((r) => porRef.get(r)));
  }, 60_000);
});

describe('ingreso automático de reportes por correo', () => {
  async function preparar() {
    vi.resetModules();
    const correoApi = await import('../api/correo');
    const panel = await import('../api/panel');
    const sup = await entrarComo('supervisor', 'Laura');
    const correo = (cuerpo: object) =>
      correoApi.POST(new Request('http://test/api/correo', { method: 'POST', headers: { cookie: sup.cookie }, body: JSON.stringify(cuerpo) }));
    const ver = async (q = '') => (await correoApi.GET(new Request(`http://test/api/correo?${q}`, { headers: { cookie: sup.cookie } }))).json();
    const reclamo = async (numero: string) => (await pool.query('SELECT * FROM reclamos_terremoto WHERE numero = $1', [numero])).rows[0];
    const eventos = async (id: number) => (await pool.query('SELECT * FROM reclamo_eventos WHERE reclamo_id = $1 ORDER BY id', [id])).rows;
    const reportes = async () => {
      const json = await (await panel.GET(new Request('http://test/api/panel', { headers: { cookie: sup.cookie } }))).json();
      return json.reportes as { numero: string; canalIngreso: string }[];
    };
    return { correo, ver, reclamo, eventos, reportes };
  }

  it('un correo con todos los datos crea el reclamo solo y responde con el número', async () => {
    const { correo, reclamo, eventos, reportes } = await preparar();
    const res = await correo({ accion: 'simular', tipo: 'completo' });
    const r = await res.json();
    expect(r).toMatchObject({ estado: 'creado', borrador: expect.stringMatching(/^B-\d{6}$/) });
    expect(r.numero).toMatch(/^TRM-\d{6}$/);

    const fila = await reclamo(r.numero);
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(fila).toMatchObject({
      canal_ingreso: 'correo',
      reportado_por: 'asegurado',
      nombre: 'María González',
      poliza: '02-B-555',
      correo: 'maria.gonzalez@ejemplo.com',
      telefono: '66123456',
      provincia: 'Chiriquí',
      distrito: 'David',
      tipo_propiedad: 'Residencial',
      habitabilidad: 'si',
      extension: 'varias',
      consentimiento: true,
      estado: 'ingresado',
    });
    expect(fila.direccion).toMatch(/San Mateo/);
    // La foto adjunta queda como foto del reporte (y se sirve como las del formulario).
    expect(fila.fotos).toHaveLength(1);
    expect(fila.fotos[0]).toMatch(/^reclamos\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\/foto-1\.jpg$/);
    expect(estado.blobs.has(fila.fotos[0])).toBe(true);
    expect(fila.tipos_dano).toEqual(expect.arrayContaining(['grietas_muros', 'cielo_raso']));
    expect(fila.fecha_dano.toISOString().slice(0, 10)).toBe(ayer);

    const ev = await eventos(fila.id);
    expect(ev.map((e) => [e.tipo, e.datos.direccion ?? e.datos.nombre])).toEqual([
      ['comunicacion', 'entrante'],
      ['documento', 'pared-sala.jpg'],
      ['comunicacion', 'saliente'],
    ]);
    expect(ev[2]).toMatchObject({ autor: 'Ingreso automático por correo', datos: { automatico: true, para: 'maria.gonzalez@ejemplo.com' } });
    expect(ev[2].datos.asunto).toContain(r.numero); // las respuestas del asegurado se asocian solas
    expect((await reportes()).find((x) => x.numero === r.numero)?.canalIngreso).toBe('correo');
    const [b] = (await pool.query('SELECT * FROM reportes_correo WHERE numero = $1', [r.borrador])).rows;
    expect(b).toMatchObject({ estado: 'creado', reclamo_id: fila.id, extractor: 'simulado' });
  });

  it('si faltan datos los pide, y con la respuesta del remitente crea el reclamo', async () => {
    const { correo, ver, reclamo, eventos } = await preparar();
    const r = await (await correo({ accion: 'simular', tipo: 'incompleto' })).json();
    expect(r.estado).toBe('incompleto');
    const faltan: string[] = r.faltan;
    expect(faltan.join(' | ')).toMatch(/provincia y el distrito/);
    expect(faltan.join(' | ')).toMatch(/dirección/);
    expect(faltan.join(' | ')).toMatch(/autorización/);
    // Nombre y teléfono salen del sistema de pólizas: no se piden.
    expect(faltan.join(' | ')).not.toMatch(/nombre completo del asegurado|teléfono/);

    const bandeja = await ver('bandeja=1');
    const pendiente = bandeja.reportes.find((x: { numero: string }) => x.numero === r.borrador);
    expect(pendiente).toMatchObject({ estado: 'pendiente', remitente: 'jose.rodriguez@ejemplo.com', respuestas: 1, mensajes: 1 });
    // El correo no aparece además entre los "por asociar".
    expect(bandeja.correos.some((c: { de: string; estado: string }) => c.de === 'jose.rodriguez@ejemplo.com' && c.estado === 'pendiente')).toBe(false);
    expect((await ver()).incompletos).toBeGreaterThanOrEqual(1);

    const res = await (await correo({ accion: 'simular_respuesta', id: pendiente.id })).json();
    expect(res).toMatchObject({ estado: 'creado', borrador: r.borrador });
    const fila = await reclamo(res.numero);
    expect(fila).toMatchObject({ nombre: 'José Rodríguez', distrito: 'San Miguelito', provincia: 'Panamá', extension: 'puntual', canal_ingreso: 'correo' });
    expect(fila.tipos_dano).toEqual(expect.arrayContaining(['vidrios', 'fisuras']));
    expect(fila.fecha_dano.toISOString().slice(0, 10)).toBe('2026-10-10');
    const ev = await eventos(fila.id);
    expect(ev.filter((e) => e.datos.direccion === 'entrante')).toHaveLength(2); // los dos correos del hilo
    expect((await correo({ accion: 'simular_respuesta', id: pendiente.id })).status).toBe(404);
  });

  it('no responde a remitentes automáticos, no mezcla hilos de otros remitentes y limita las respuestas', async () => {
    vi.resetModules();
    const { procesarEntrante, reporteSimulado } = await import('../api/_correo');
    const base = reporteSimulado('incompleto');
    // Un remitente automático nunca recibe respuesta ni crea reportes.
    expect(await procesarEntrante({ ...base, mensajeId: 'auto-1', de: 'no-reply@banco.com' }, 'simulado')).toMatchObject({ estado: 'sin_asociar' });
    expect(await procesarEntrante({ ...base, mensajeId: 'auto-2', asunto: 'Respuesta automática: fuera de la oficina' }, 'simulado')).toMatchObject({
      estado: 'sin_asociar',
    });

    const primero = await procesarEntrante({ ...base, mensajeId: 'hilo-1', de: 'ana@ejemplo.com' }, 'simulado');
    expect(primero.estado).toBe('incompleto');
    // Otro remitente que usa la misma referencia no modifica ese reporte.
    const intruso = await procesarEntrante(
      { ...base, mensajeId: 'hilo-x', de: 'otro@ejemplo.com', asunto: `RE: [${primero.borrador}]`, texto: 'Mi póliza es la NOEXISTE-1 y la casa está en Colón. Grietas por el sismo.' },
      'simulado',
    );
    expect(intruso.borrador).not.toBe(primero.borrador);
    expect(intruso.faltan?.[0]).toMatch(/no encontramos la póliza NOEXISTE-1/);

    // Máximo tres respuestas automáticas por reporte.
    for (let i = 2; i <= 5; i++) {
      await procesarEntrante({ ...base, mensajeId: `hilo-${i}`, de: 'ana@ejemplo.com', asunto: `RE: ${primero.borrador}`, texto: 'No sé.' }, 'simulado');
    }
    const [b] = (await pool.query('SELECT respuestas, mensajes FROM reportes_correo WHERE numero = $1', [primero.borrador])).rows;
    expect(b.respuestas).toBe(3);
    expect(b.mensajes).toHaveLength(5);
  });

  it('si la lectura falla, el correo queda en la bandeja y se puede reintentar', async () => {
    const { correo, ver } = await preparar();
    process.env.EXTRACTOR_PROVEEDOR = 'claude'; // sin ANTHROPIC_API_KEY: falla
    try {
      expect(await (await correo({ accion: 'simular', tipo: 'completo' })).json()).toMatchObject({ estado: 'sin_asociar' });
    } finally {
      delete process.env.EXTRACTOR_PROVEEDOR;
    }
    const pendiente = (await ver('bandeja=1')).correos.find((c: { de: string; estado: string }) => c.de === 'maria.gonzalez@ejemplo.com' && c.estado === 'pendiente');
    expect(pendiente).toBeDefined();
    expect(await (await correo({ accion: 'reintentar', mensajeId: pendiente.mensajeId })).json()).toMatchObject({ estado: 'creado' });
  });

  it('con Claude envía el hilo y usa la salida estructurada', async () => {
    vi.resetModules();
    const llamadas: Record<string, unknown>[] = [];
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        beta = {
          messages: {
            parse: async (params: Record<string, unknown>) => {
              llamadas.push(params);
              return {
                stop_reason: 'end_turn',
                parsed_output: {
                  esReporteDeDanos: true, reportadoPor: 'asegurado', reportanteNombre: '', reportanteCodigo: '', reportanteTelefono: '',
                  nombre: 'Luis Batista', poliza: '04-C-321', unidad: '', correo: '', telefono: '62223333', provincia: 'Coclé', distrito: 'Penonomé',
                  direccion: 'Calle 2, casa 8', tipoPropiedad: 'Residencial', tiposDano: ['techo', 'inventado'], habitabilidad: 'parcial', riesgos: [],
                  extension: 'varias', operacion: '', fechaDano: '2026-10-10', descripcion: 'Se movieron las láminas del techo y entra agua.', consentimiento: true,
                },
              };
            },
          },
        };
      },
    }));
    process.env.EXTRACTOR_PROVEEDOR = 'claude';
    process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
    try {
      const { procesarEntrante, reporteSimulado } = await import('../api/_correo');
      const r = await procesarEntrante({ ...reporteSimulado('completo'), mensajeId: 'claude-1', de: 'luis@ejemplo.com', deNombre: 'Luis' }, 'simulado');
      expect(r.estado).toBe('creado');
      expect(llamadas[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
      expect(JSON.stringify(llamadas[0].messages)).toContain('luis@ejemplo.com');
      const fila = (await pool.query('SELECT * FROM reclamos_terremoto WHERE numero = $1', [r.numero])).rows[0];
      expect(fila).toMatchObject({ nombre: 'Luis Batista', distrito: 'Penonomé', habitabilidad: 'parcial', correo: 'luis@ejemplo.com' });
      expect(fila.tipos_dano).toEqual(['techo']); // lo que no está en el catálogo se descarta
    } finally {
      delete process.env.EXTRACTOR_PROVEEDOR;
      delete process.env.ANTHROPIC_API_KEY;
      vi.doUnmock('@anthropic-ai/sdk');
    }
  });
});

describe('simulaciones', () => {
  it('nunca se permiten en producción', async () => {
    vi.resetModules();
    const correoApi = await import('../api/correo');
    const sup = await entrarComo('supervisor');
    const pedir = (cuerpo: object) =>
      correoApi.POST(new Request('http://test/api/correo', { method: 'POST', headers: { cookie: sup.cookie }, body: JSON.stringify(cuerpo) }));
    process.env.VERCEL_ENV = 'production';
    try {
      for (const cuerpo of [{ accion: 'simular', tipo: 'completo' }, { accion: 'simular' }, { accion: 'simular', id: 1 }, { accion: 'simular_respuesta', id: 1 }]) {
        expect((await pedir(cuerpo)).status).toBe(400);
      }
      const json = await (await correoApi.GET(new Request('http://test/api/correo', { headers: { cookie: sup.cookie } }))).json();
      expect(json).toMatchObject({ proveedor: 'simulado', simulacion: false });
    } finally {
      delete process.env.VERCEL_ENV;
    }
    expect(await (await pedir({ accion: 'simular' })).json()).toMatchObject({ estado: 'sin_asociar' });
  });
});

describe('avisos automáticos de cambio de fase', () => {
  async function preparar(datos: object = {}) {
    vi.resetModules();
    const { reclamos } = await cargarApi();
    const gestion = await import('../api/gestion');
    const sup = await entrarComo('supervisor', 'Laura');
    const ref = crypto.randomUUID();
    await reclamos.POST(peticion({ ...BASE, ref, ...datos }));
    const { id, numero } = (await pool.query('SELECT id, numero FROM reclamos_terremoto WHERE ref = $1', [ref])).rows[0];
    const accion = (cuerpo: object) =>
      gestion.POST(new Request('http://test/api/gestion', { method: 'POST', headers: { cookie: sup.cookie }, body: JSON.stringify({ id, ...cuerpo }) }));
    const avisos = async () =>
      (await pool.query("SELECT * FROM reclamo_eventos WHERE reclamo_id = $1 AND datos->>'aviso' = 'fase' ORDER BY id", [id])).rows;
    return { id, numero, accion, avisos };
  }

  it('avisa al asegurado y al corredor, con el texto de la fase', async () => {
    const { numero, accion, avisos } = await preparar({
      reportadoPor: 'corredor',
      reportanteNombre: 'Corredora López',
      reportanteCorreo: 'corredora@ejemplo.com',
      reportanteTelefono: '',
    });
    const res = await accion({ tipo: 'estado', estado: 'en_analisis', estadoAnterior: 'ingresado', avisar: true });
    expect(res.status).toBe(201);
    expect((await res.json()).aviso).toEqual({ plantilla: 'en_analisis', enviados: ['ana@example.com', 'corredora@ejemplo.com'], fallidos: [] });
    const [a, b] = await avisos();
    expect(a).toMatchObject({ autor: 'Laura', datos: { plantilla: 'en_analisis', envio: 'simulado', para: 'ana@example.com', automatico: true } });
    expect(a.datos.asunto).toBe(`ASSA · Su reclamo ${numero} está en análisis`);
    expect(a.datos.texto).toMatch(/^Hola, Ana\. Le saluda Laura de ASSA/);
    expect(b.datos).toMatchObject({ para: 'corredora@ejemplo.com', destinatario: 'Corredora López' });
    expect(b.datos.texto).toMatch(/^Hola, Corredora\./);

    // Inspección con fecha: el aviso lleva la fecha.
    await accion({ tipo: 'estado', estado: 'con_ajustador', estadoAnterior: 'en_analisis', fechaInspeccion: '2026-10-20', avisar: true });
    expect((await avisos()).at(-1).datos.texto).toMatch(/martes, 20 de octubre/);
  });

  it('no avisa sin pedirlo, ni en fases que necesitan un mensaje redactado, y el cambio no depende del correo', async () => {
    const { accion, avisos } = await preparar();
    expect((await (await accion({ tipo: 'estado', estado: 'en_analisis', estadoAnterior: 'ingresado' })).json()).aviso).toBeUndefined();
    const res = await accion({ tipo: 'estado', estado: 'declinado', estadoAnterior: 'en_analisis', motivoCierre: 'bajo_deducible', avisar: true });
    expect((await res.json()).aviso).toEqual({ plantilla: null, enviados: [], fallidos: [] });
    expect(await avisos()).toHaveLength(0);
  });

  it('si el correo falla, la fase queda guardada y se informa', async () => {
    const { id, accion, avisos } = await preparar();
    Object.assign(process.env, { CORREO_PROVEEDOR: 'microsoft365', M365_TENANT_ID: 't', M365_CLIENT_ID: 'c', M365_CLIENT_SECRET: 's', M365_BUZON: 'b@assa.test' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('caído', { status: 503 })));
    try {
      const res = await accion({ tipo: 'estado', estado: 'pagado', estadoAnterior: 'ingresado', avisar: true });
      expect(res.status).toBe(201);
      expect((await res.json()).aviso).toMatchObject({ plantilla: 'pago', enviados: [], fallidos: ['ana@example.com'] });
    } finally {
      vi.unstubAllGlobals();
      for (const k of ['CORREO_PROVEEDOR', 'M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'M365_BUZON']) delete process.env[k];
    }
    expect((await pool.query('SELECT estado FROM reclamos_terremoto WHERE id = $1', [id])).rows[0].estado).toBe('pagado');
    expect(await avisos()).toHaveLength(0);
  });
});
