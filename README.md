# ASSA · Reporte de daños por sismo

Formulario para que los asegurados de ASSA Panamá reporten daños por el sismo.
Cada reporte recibe una prioridad (`alta`, `media`, `baja`) para programar primero las inspecciones urgentes.

- **Producción:** https://assa-terremoto.vercel.app (proyecto Vercel `assa-terremoto`)
- **Stack:** Vite + React (TypeScript), función serverless en `api/reclamos.ts`
- **Datos:** tabla `reclamos_terremoto` en Neon Postgres (se crea sola en el primer envío)
- **Fotos:** hasta 5 por reclamo, comprimidas en el navegador y guardadas en un Vercel Blob **privado**
  (`reclamos/<fecha>/<uuid>/foto-N.jpg`); la ruta queda en la columna `fotos`.

## Panel de reportes (BI)

- **URL:** https://assa-terremoto.vercel.app/panel (cada persona entra con su correo y clave; ver *Accesos*)
- KPIs, reportes por día y por provincia según prioridad, reglas de prioridad activadas, tipos de daño,
  distritos con más casos de prioridad alta y la **cola de atención** (alta → media → baja, del más antiguo al más reciente)
  con detalle, motivos y fotos. Filtros por prioridad, provincia, tipo de inmueble y periodo; exporta CSV.
- Solo lectura. También muestra los reportes que están en `pendientes/` y aún no se cargaron a la tabla.

## Gestión de reclamos

**Ingreso:** el formulario (`/`) lo usan asegurados, corredores y ejecutivos de ASSA. Si reporta un corredor o ejecutivo se piden sus
datos (nombre, código de corredor, correo, teléfono) y el contacto del asegurado es opcional; sus datos se conservan para reportar
otro inmueble.

**Consulta pública** (`/consulta`): con el número de reporte y la póliza, cualquiera (asegurado, corredor, comercial) ve en qué fase
está, sin datos personales.

**Ficha del caso en el panel:**

- **Gestión:** fase — Ingresado → Esperando información completa → En análisis → Con analista o ajustador → Pagado / Declinado
  (con motivo) —, fecha de inspección, responsable y notas internas.
- **Análisis:** causa del daño y coberturas afectadas con monto reclamado, reserva y pagado.
- **Documentos:** póliza, presupuestos, informes, correos (.eml/.msg), finiquitos… hasta 25 MB, subidos directo a Blob privado
  (`/api/documentos` emite el token) y servidos solo con sesión.
- **Comunicación:** plantillas, WhatsApp o correo con el texto listo al asegurado o a quien reportó, y registro de cada contacto.
- **Historial:** todo lo que pasó, con fecha y autor.

**BI:** reclamos por fase, días promedio en la fase actual, canal de ingreso, corredores con más reclamos, montos por cobertura,
coberturas afectadas y causas, además de prioridad y daños.

Mientras no haya usuarios individuales, cada persona indica su nombre en el panel (se guarda en su navegador) y se usa como autor.
Cada acción se guarda en `reclamo_eventos` (solo se agregan filas) y actualiza el caso en la misma sentencia; si otra persona lo
cambió un momento antes, la API responde 409 en vez de pisar el cambio. El respaldo diario incluye los eventos.

## Accesos (usuarios y roles)

Cada persona entra con su correo y clave (`/api/sesion`; cookie firmada con `SESION_SECRETO`, 12 h). En cada solicitud se verifica
que el usuario siga activo, así que desactivarlo corta el acceso de inmediato. El login se bloquea 15 minutos tras 5 intentos fallidos.

| Rol | Ve | Puede |
|---|---|---|
| Supervisor de reclamos | Todos los reclamos, costos, BI | Todo, y administrar usuarios |
| Analista interno | Todos los reclamos y costos (sin BI) | Fase, asignación, análisis, documentos, comunicación, notas |
| Analista o ajustador externo | **Solo sus reclamos asignados**, sin costo estimado ni reglas | Análisis, documentos, notas |
| Comercial | Todos los reclamos, costos, BI | Solo lectura |
| Canales | Todos los reclamos | Comunicación, documentos, notas |

Los permisos están en `shared/roles.ts` y se aplican en el servidor (`api/`). Los usuarios no se borran, se desactivan
(pestaña *Usuarios* del panel, solo supervisores). La tabla `auditoria` registra entradas, salidas, intentos fallidos, casos y
documentos vistos y cambios de usuarios.

## Conector de pólizas

`api/_polizas.ts` define una interfaz única (`buscar` y `documento`) con dos implementaciones, elegidas con `POLIZAS_PROVEEDOR`:

- `simulado` (por defecto): datos de prueba deterministas por número de póliza, con PDFs de prueba. La ficha lo indica como
  "Datos simulados". El número `NOEXISTE…` simula una póliza inexistente.
- `http`: el sistema de pólizas de ASSA. Requiere `POLIZAS_API_URL` y `POLIZAS_API_TOKEN` (Bearer). Contrato:
  - `GET {URL}/polizas/{numero}` → `200` con el JSON `Poliza` de `api/_polizas.ts` (estado, vigencia, asegurado, corredor,
    ubicación, coberturas con suma asegurada y deducible de terremoto, lista de documentos) o `404`.
  - `GET {URL}/polizas/{numero}/documentos/{id}` → `200` con el archivo (y `content-disposition`) o `404`.

El panel muestra la póliza en la pestaña *Póliza* de cada caso: vigencia frente a la fecha del daño, deducible exacto por
cobertura frente a la reserva, y los documentos.

## Conector de correo (Microsoft 365)

`api/_correo.ts` define una interfaz única (`enviar`, `recibir`, `marcarLeido`) con dos implementaciones, elegidas con
`CORREO_PROVEEDOR`:

- `simulado` (por defecto): no envía nada. Los correos quedan en el historial como "enviado (simulado)" y la pestaña
  *Comunicación* tiene un botón "Simular correo entrante" (responde el asegurado con un PDF adjunto).
- `microsoft365`: buzón compartido vía Microsoft Graph con credenciales de aplicación. Requiere `M365_TENANT_ID`,
  `M365_CLIENT_ID`, `M365_CLIENT_SECRET` y `M365_BUZON`. La app de Azure necesita los permisos de aplicación
  **`Mail.Send`** y **`Mail.ReadWrite`** (marcar como leído), idealmente limitados a ese buzón con una
  *application access policy* de Exchange.

**Enviar:** desde *Comunicación* (`POST /api/gestion { tipo: 'correo' }`), con plantillas. La dirección sale siempre del caso
(asegurado o quien reportó) y el asunto lleva siempre el número `TRM-000123`. Si el envío falla no se registra nada.

**Recibir:** el panel pide leer el buzón al abrirse y cada 2 minutos (`POST /api/correo { accion: 'sincronizar' }`, máximo una
lectura por minuto) y el cron diario también lo hace. Cada correo no leído se guarda en `correos_recibidos` (solo se agregan
filas; un mismo mensaje nunca se registra dos veces) y luego se marca como leído en el buzón; si algo falla, queda sin leer y se
reintenta. Si el asunto trae el número de un reclamo existente, el correo entra al historial del caso como comunicación recibida,
sus adjuntos (hasta 25 MB, sin las imágenes de la firma) quedan en *Documentos* y el caso muestra **Correo nuevo** en la cola
hasta que alguien abre *Comunicación* o responde.

**Correos sin caso:** los que llegan sin número (o con un número que no existe) quedan en `correos_recibidos` sin `reclamo_id` y
sus adjuntos en Blob `correos/AAAA-MM-DD/`. Aparecen en la vista **Correos** del panel (supervisor, analista y canales), que
sugiere casos por el correo del remitente o la póliza mencionada. Al **asociarlo**, los adjuntos se copian a los documentos del
caso y el correo entra a su historial; al **descartarlo** solo se marca (`descartado_en`): nada se borra.

## Disponibilidad ("no se puede caer")

- **Límite de solicitudes** (`api/_limites.ts`): por IP, 60 reportes y 30 consultas públicas cada 10 minutos (oficinas de
  corredores comparten IP). Responde 429 con un mensaje claro; el formulario conserva los datos. La IP no se guarda, solo un
  resumen (hash) en la tabla `limites`. Si la base de datos no responde, el límite deja pasar: nunca se pierde un reporte.
- **Salud** (`GET /api/salud`): 200 `ok`/`degradado` o 503 `caido` (base de datos o archivos sin respuesta). Con
  `Authorization: Bearer CRON_SECRET` o sesión de supervisor incluye el detalle: base de datos, archivos, reportes en respaldo
  sin cargar, último respaldo diario (degradado si tiene más de 36 h) y correos sin caso. Los supervisores ven un aviso en el
  panel cuando algo falla. Para alertas por correo o SMS, apuntar un monitor externo (UptimeRobot, Better Stack…) a esta ruta.
- **Carga:** la prueba `carga` envía 200 reportes simultáneos (con reenvíos) y verifica que todos quedan una sola vez y con
  números únicos (contra Postgres local).

## Ambiente de pruebas

El ambiente **Preview** de Vercel es el ambiente de pruebas. Tiene sus propios recursos y **nunca** toca los de producción:

| | Producción (`Production`) | Pruebas (`Preview` y `Development`) |
|---|---|---|
| Base de datos | Neon `neon-red-apple` | Neon `assa-terremoto-pruebas` |
| Archivos | Blob `assa-terremoto-fotos` | Blob `assa-terremoto-pruebas` |
| `SESION_SECRETO`, `CRON_SECRET` | propios | propios |
| `AMBIENTE` | (no existe) | `pruebas`: aviso naranja "Ambiente de pruebas" en todas las páginas |

```bash
npx vercel deploy --token "$VERCEL_TOKEN" --yes   # publica en pruebas (sin --prod); devuelve la URL
npm run datos-prueba                              # usuarios y 40 reclamos ficticios en pruebas (claves en claves-pruebas.txt)
```

Las URL de Preview están protegidas por Vercel (hay que entrar con una cuenta del equipo). `datos-prueba` se niega a correr
si `AMBIENTE` no es `pruebas`. `vercel env pull` sin `--environment` baja las variables de pruebas, no las de producción.

## Desarrollo

```bash
npm install
vercel env pull .env.local   # variables del ambiente de pruebas (base de datos y Blob de pruebas)
vercel dev                   # sitio + API en http://localhost:3000
npm run build                # typecheck + build
```

## Estructura

- `shared/catalogos.ts` — provincias/distritos, tipos de daño y reglas de validación (usado por el formulario y la API)
- `src/App.tsx` — formulario
- `src/fotos.ts` — compresión de fotos (máx. 1600 px, JPEG ≤ 1 MB)
- `api/reclamos.ts` — `POST /api/reclamos`: valida, sube fotos y guarda el reclamo; responde `{ numero: "TRM-000123" }`

## Protección de datos (nunca se pierde un reporte)

1. **Borrador en el dispositivo:** el formulario se guarda en `localStorage` mientras se llena; si se cierra o falla el envío, se recupera.
2. **Sin duplicados:** cada reporte lleva una `ref` (UUID) creada en el navegador; reenviar devuelve el mismo número.
3. **Reintentos:** la API reintenta el guardado en Neon 3 veces.
4. **Respaldo si Neon no responde:** el reporte se guarda como `pendientes/<ref>.json` en Blob y el asegurado recibe un número `P-XXXXXXXX`.
5. **Cron diario** (`/api/respaldo`, 08:00 UTC): carga los pendientes a la tabla (sin duplicar; los JSON se conservan) y guarda una copia completa en `respaldos/AAAA-MM-DD.json`.
6. **Migraciones solo aditivas:** el esquema solo usa `CREATE TABLE IF NOT EXISTS` y `ADD COLUMN IF NOT EXISTS`. El código no tiene ningún `DELETE`, `DROP` ni `TRUNCATE`.

Pruebas (contra un Postgres **local**, nunca producción):

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5433/postgres npm test
```

## Reglas de prioridad (`evaluarPrioridad` en `shared/catalogos.ts`)

La prioridad refleja el **costo estimado de reparación** para ASSA y la necesidad de resolver rápido, no el riesgo personal del asegurado.

**Costo estimado (% de la suma asegurada)** = suma del costo típico de cada daño en un área (`COSTO_DANO`) × extensión
(un área ×1, varias ×2, todo el inmueble ×3.5) + operación detenida (+5 %) o parcial (+2 %) en comercial e industrial.
Referencia: vivienda de unos B/.150,000; en inmuebles de menor valor el % real es mayor.

| Daño (un área) | % | Daño (un área) | % |
|---|---|---|---|
| Grietas finas en paredes | 0.2 | Tanques, aires acondicionados o paneles | 1.5 |
| Vidrios rotos | 0.3 | Cercas, portones o muros de colindancia | 2 |
| Puertas o ventanas que no cierran | 0.6 | Techo o cubierta | 2.5 |
| Cielo raso | 0.7 | Mercancía o inventario | 3 |
| Azulejos, baldosas o enchapes | 0.8 | Maquinaria del negocio | 5 |
| Grietas abiertas en paredes | 1 | Paredes caídas o inclinadas | 6 |
| Muebles y electrodomésticos · otro | 1 | Grietas en columnas, vigas o losas | 8 |
| Tuberías o cableado | 1.2 | Pisos hundidos o desnivelados | 12 |

| Prioridad | Cuándo |
|---|---|
| **Alta** | Daño estructural · no habitable **respaldado por los daños** · costo estimado ≥ 8 % |
| **Media** | Parcialmente habitable **respaldado** · costo estimado de 2 % a 8 % (probablemente supera el deducible) |
| **Cierre rápido** | Residencial con costo estimado < 2 %: probablemente no supera el deducible (2 % de la suma asegurada) |
| **Baja** | El resto (comercial o industrial con costo < 2 %) |

- **Habitabilidad respaldada:** "no habitable" cuenta solo con daño estructural, en techo o en todo el inmueble; "parcialmente" además con grietas abiertas, cielo raso o tuberías. Si no se respalda, queda como aviso.
- **Riesgos de seguridad** (gas, electricidad, caída, agua): aviso para el equipo y mensaje de seguridad al asegurado; no cambian la prioridad.
- El panel recalcula la prioridad con las reglas vigentes; la columna `prioridad` guardada no se modifica.

## Consultar reclamos

```sql
SELECT numero, prioridad, creado_en, nombre, poliza, telefono, provincia, distrito,
       tipo_propiedad, habitabilidad, riesgos, extension, operacion, tipos_dano,
       array_length(fotos, 1) AS fotos
FROM reclamos_terremoto
WHERE estado = 'recibido'
ORDER BY array_position(ARRAY['alta','media','rapido','baja'], prioridad), creado_en;
```
