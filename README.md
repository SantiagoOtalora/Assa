# ASSA · Reporte de daños por sismo

Formulario de **triage** para que los asegurados de ASSA Panamá reporten daños por el sismo.
Cada reporte recibe una prioridad (`alta`, `media`, `baja`) para programar primero las inspecciones urgentes.

- **Producción:** https://assa-terremoto.vercel.app (proyecto Vercel `assa-terremoto`)
- **Stack:** Vite + React (TypeScript), función serverless en `api/reclamos.ts`
- **Datos:** tabla `reclamos_terremoto` en Neon Postgres (se crea sola en el primer envío)
- **Fotos:** hasta 5 por reclamo, comprimidas en el navegador y guardadas en un Vercel Blob **privado**
  (`reclamos/<fecha>/<uuid>/foto-N.jpg`); la ruta queda en la columna `fotos`.

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

## Regla de prioridad (`calcularPrioridad` en `shared/catalogos.ts`)

| Prioridad | Cuándo |
|---|---|
| **alta** | Inmueble no habitable · riesgo de gas, eléctrico o de caída · grietas estructurales, colapso parcial o hundimiento |
| **media** | Habitable parcialmente · fuga de agua · todo el inmueble afectado · operación detenida · daños en techo, cielo raso, puertas/ventanas, instalaciones, tanques, muros perimetrales o maquinaria |
| **baja** | El resto (fisuras, acabados, vidrios, contenido, inventario) |

La prioridad se calcula en el servidor; al asegurado solo se le indica si su caso quedó como prioritario.

## Consultar reclamos

```sql
SELECT numero, prioridad, creado_en, nombre, poliza, telefono, provincia, distrito,
       tipo_propiedad, habitabilidad, riesgos, extension, operacion, tipos_dano,
       array_length(fotos, 1) AS fotos
FROM reclamos_terremoto
WHERE estado = 'recibido'
ORDER BY array_position(ARRAY['alta','media','baja'], prioridad), creado_en;
```
