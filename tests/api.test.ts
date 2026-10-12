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
