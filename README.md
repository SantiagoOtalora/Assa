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

La prioridad refleja el **gasto estimado** para ASSA y la necesidad de resolver rápido, no el riesgo personal del asegurado.

| Prioridad | Cuándo |
|---|---|
| **Alta** | Daño estructural (columnas, vigas, losas, paredes caídas, pisos hundidos) · no habitable **respaldado por los daños** · gasto estimado ≥ 50 puntos |
| **Media** | Parcialmente habitable **respaldado** · gasto estimado de 15 a 49 puntos |
| **Cierre rápido** | Residencial con **solo** daños menores (grietas finas, vidrios, azulejos) sin afectar todo el inmueble: probablemente no supera el deducible (2 % de la suma asegurada) |
| **Baja** | El resto |

- **Puntos de gasto** = suma de puntos por daño (`PUNTOS_DANO`) × extensión (un área ×1, varias ×1.5, todo ×2) + operación detenida (+20) o parcial (+10) en comercial e industrial.
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
