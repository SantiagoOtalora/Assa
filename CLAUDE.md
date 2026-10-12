# Reclamos por sismo · ASSA Panamá

Lea primero **`docs/ESTADO.md`**: qué está hecho, arquitectura, decisiones del negocio y próximos pasos.
El README tiene el detalle técnico (prioridad, accesos, contrato del conector de pólizas, consultas SQL).

## Reglas de trabajo
- Todo en español (interfaz, código, commits). No usar la palabra "triage".
- **Los datos nunca se deben perder**: migraciones solo aditivas (`CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
  en `api/_db.ts`; nada de `DELETE`, `DROP` ni `TRUNCATE` sobre datos reales; el historial (`reclamo_eventos`) y la
  `auditoria` solo agregan filas; los usuarios se desactivan, no se borran.
- **No crear datos de prueba en producción.** Probar la API con vitest contra un Postgres local y la interfaz con
  Playwright simulando la API (`page.route`).
- Los permisos se aplican en el servidor (`shared/roles.ts` + `api/`), no solo ocultando botones.
- Integraciones sin acceso todavía (pólizas, Microsoft 365) se construyen como conector con modo `simulado`.
- Rama de trabajo: `claude/peaceful-cori-royin6`. No crear PR sin que el usuario lo pida.

## Comandos
```bash
npm install
npm run build                      # typecheck + build
# Pruebas: Postgres 16 local (binarios en /usr/lib/postgresql/16/bin; correr como usuario postgres)
TEST_DATABASE_URL=postgres://postgres@localhost:5433/postgres npm test
# Publicar (el proyecto de Vercel no está conectado a GitHub)
npx vercel deploy --token "$VERCEL_TOKEN" --yes          # ambiente de pruebas (Preview: base de datos y Blob propios)
npx vercel deploy --prod --token "$VERCEL_TOKEN" --yes   # producción
npm run datos-prueba                                     # datos ficticios, solo en pruebas
```
- La red de las sesiones en la nube bloquea `*.vercel.app`: no se puede abrir producción desde ahí; usar
  `npx vercel logs --environment production --json` para diagnosticar.
- Variables de producción locales: `npx vercel env pull .env.local --environment production` (no subir `.env*`).
