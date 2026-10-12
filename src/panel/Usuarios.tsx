// Administración de usuarios (supervisores). Los usuarios no se borran: se
// desactivan, para conservar la autoría del historial.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ROLES, type UsuarioSesion } from '../../shared/roles.js';
import { fmtFechaHora } from './comun';

type Fila = {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
  organizacion: string | null;
  activo: boolean;
  creado_en: string;
  ultimo_acceso: string | null;
};

const tituloRol = (rol: string) => ROLES.find((r) => r.id === rol)?.titulo ?? rol;

export default function Usuarios({ usuario }: { usuario: UsuarioSesion }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [clave, setClave] = useState<{ correo: string; clave: string } | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', correo: '', rol: 'analista', organizacion: '' });

  const cargar = useCallback(async () => {
    const res = await fetch('/api/usuarios', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setFilas((await res.json()).usuarios);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function pedir(metodo: 'POST' | 'PATCH', cuerpo: object) {
    setAviso(null);
    const res = await fetch('/api/usuarios', {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) setAviso({ ok: false, texto: json.error ?? 'No se pudo completar la acción.' });
    await cargar();
    return res?.ok ? json : null;
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    const json = await pedir('POST', nuevo);
    if (json) {
      setClave({ correo: nuevo.correo.trim().toLowerCase(), clave: json.claveTemporal });
      setNuevo({ nombre: '', correo: '', rol: 'analista', organizacion: '' });
    }
  }

  return (
    <>
      <div className="panel-titulo">
        <div>
          <h1>Usuarios</h1>
          <p>Cree accesos, asigne roles y restablezca claves. Los usuarios no se borran: se desactivan.</p>
        </div>
      </div>

      {aviso && <p className={aviso.ok ? 'aviso-ok' : 'error resumen'}>{aviso.texto}</p>}
      {clave && (
        <div className="clave-temporal" role="status">
          <p>
            Clave temporal para <strong>{clave.correo}</strong>. Compártala por un canal seguro: no se volverá a mostrar.
          </p>
          <code>{clave.clave}</code>
          <button className="enlace" onClick={() => setClave(null)}>
            Ya la copié
          </button>
        </div>
      )}

      <section className="tarjeta grafico ancho">
        <h2>Nuevo usuario</h2>
        <form className="nuevo-usuario" onSubmit={crear}>
          <input
            placeholder="Nombre y apellido"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            aria-label="Nombre"
          />
          <input
            type="email"
            placeholder="Correo"
            value={nuevo.correo}
            onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })}
            aria-label="Correo"
          />
          <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })} aria-label="Rol">
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.titulo}
              </option>
            ))}
          </select>
          <input
            placeholder={nuevo.rol === 'ajustador' ? 'Empresa ajustadora' : 'Área u organización (opcional)'}
            value={nuevo.organizacion}
            onChange={(e) => setNuevo({ ...nuevo, organizacion: e.target.value })}
            aria-label="Organización"
          />
          <button className="boton compacto" disabled={nuevo.nombre.trim().length < 2 || !nuevo.correo.includes('@')}>
            Crear
          </button>
        </form>
        <p className="sec">{ROLES.find((r) => r.id === nuevo.rol)?.descripcion}</p>
      </section>

      <section className="tarjeta grafico ancho">
        <h2>Usuarios ({filas?.length ?? 0})</h2>
        {!filas ? (
          <p className="sec">Cargando…</p>
        ) : (
          <div className="scroll-x">
            <table className="cola tabla-usuarios">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Último acceso</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className={f.activo ? '' : 'inactivo'}>
                    <td>
                      <div>{f.nombre}</div>
                      {f.organizacion && <div className="sec">{f.organizacion}</div>}
                      {!f.activo && <div className="sec">Desactivado</div>}
                    </td>
                    <td>{f.correo}</td>
                    <td>
                      {f.id === usuario.id ? (
                        tituloRol(f.rol)
                      ) : (
                        <select
                          value={f.rol}
                          onChange={(e) => pedir('PATCH', { id: f.id, accion: 'rol', rol: e.target.value })}
                          aria-label={`Rol de ${f.nombre}`}
                        >
                          {ROLES.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.titulo}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="mono">{f.ultimo_acceso ? fmtFechaHora.format(new Date(f.ultimo_acceso)) : 'Nunca'}</td>
                    <td className="acciones-usuario">
                      <button
                        className="enlace"
                        onClick={async () => {
                          const json = await pedir('PATCH', { id: f.id, accion: 'restablecer' });
                          if (json?.claveTemporal) setClave({ correo: f.correo, clave: json.claveTemporal });
                        }}
                      >
                        Restablecer clave
                      </button>
                      {f.id !== usuario.id && (
                        <button className="enlace" onClick={() => pedir('PATCH', { id: f.id, accion: f.activo ? 'desactivar' : 'activar' })}>
                          {f.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tarjeta grafico ancho">
        <h2>Qué puede hacer cada rol</h2>
        <ul className="roles">
          {ROLES.map((r) => (
            <li key={r.id}>
              <strong>{r.titulo}:</strong> {r.descripcion}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
