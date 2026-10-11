# ASSA · Reporte de daños por sismo

Formulario para que los asegurados de ASSA Panamá reporten daños por el sismo.
Cada reporte recibe una prioridad (`alta`, `media`, `baja`) para programar primero las inspecciones urgentes.

- **Producción:** https://assa-terremoto.vercel.app (proyecto Vercel `assa-terremoto`)
- **Stack:** Vite + React (TypeScript), función serverless en `api/reclamos.ts`
- **Datos:** tabla `reclamos_terremoto` en Neon Postgres (se crea sola en el primer envío)
- **Fotos:** hasta 5 por reclamo, comprimidas en el navegador y guardadas en un Vercel Blob **privado**
  (`reclamos/<fecha>/<uuid>/foto-N.jpg`); la ruta queda en la columna `fotos`.

## Panel de reportes (BI)

- **URL:** https://assa-terremoto.vercel.app/panel (clave en la variable `PANEL_CLAVE` de Vercel; cambiarla cierra todas las sesiones)
- KPIs, reportes por día y por provincia según prioridad, reglas de prioridad activadas, tipos de daño,
  distritos con más casos de prioridad alta y la **cola de atención** (alta → media → baja, del más antiguo al más reciente)
  con detalle, motivos y fotos. Filtros por prioridad, provincia, tipo de inmueble y periodo; exporta CSV.
- Solo lectura. También muestra los reportes que están en `pendientes/` y aún no se cargaron a la tabla.

## Gestión de casos (flujo)

En la ficha de cada caso (clic en la cola):

- **Gestión:** estado (Recibido → En revisión → Esperando al asegurado → Inspección programada → Inspeccionado → En ajuste → Cerrado),
  motivo de cierre, fecha de inspección, responsable y notas internas.
- **Comunicación:** plantillas (`shared/flujo.ts`) que se llenan con los datos del caso, botones para abrir WhatsApp o el correo con
  el texto listo, y registro de cada contacto (canal y resultado).
- **Historial:** todo lo que pasó con el caso, con fecha y autor.

Mientras no haya usuarios individuales, cada persona indica su nombre en el panel (se guarda en su navegador) y se usa como autor.
Cada acción se guarda en `reclamo_eventos` (solo se agregan filas) y actualiza el estado actual del caso en la misma sentencia; si
otra persona cambió el caso un momento antes, la API responde 409 en vez de pisar el cambio. El respaldo diario incluye los eventos.

## Desarrollo

```bash
npm install
vercel env pull .env.local   # DATABASE_URL y BLOB_READ_WRITE_TOKEN
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
