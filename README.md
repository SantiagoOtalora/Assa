# ASSA · Reporte de daños por sismo

Formulario web para que los asegurados de ASSA Panamá reporten daños por el sismo.

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

## Consultar reclamos

```sql
SELECT numero, creado_en, nombre, poliza, telefono, provincia, distrito,
       tipo_propiedad, habitabilidad, tipos_dano, array_length(fotos, 1) AS fotos
FROM reclamos_terremoto
ORDER BY (habitabilidad = 'no') DESC, creado_en;
```
