# Estado del proyecto · Reclamos por sismo ASSA Panamá

_Última actualización: 12 de octubre de 2026._

Plataforma para que asegurados, corredores y ejecutivos de ASSA Panamá reporten daños por el sismo, y para que el
equipo de reclamos los gestione de punta a punta. Este documento resume lo hecho, cómo está armado, las decisiones
del negocio y lo que sigue, para retomar el trabajo en una sesión nueva.

## 1. Dónde está todo

| Qué | Dónde |
|---|---|
| Formulario público | https://assa-terremoto.vercel.app |
| Consulta de estado (pública) | https://assa-terremoto.vercel.app/consulta |
| Panel interno (con login) | https://assa-terremoto.vercel.app/panel |
| Código | GitHub `SantiagoOtalora/Assa`, rama `claude/peaceful-cori-royin6` (aún sin PR a `main`) |
| Hosting | Vercel, proyecto `assa-terremoto` (equipo `santiago-os-projects`). **No** está conectado a GitHub: se publica con la CLI |
| Base de datos | Neon Postgres (variables `DATABASE_URL` y `POSTGRES_*` en Vercel) |
| Archivos | Vercel Blob **privado** `assa-terremoto-fotos` (`BLOB_READ_WRITE_TOKEN`) |
| Ambiente de pruebas | Despliegues *Preview* de Vercel (`npx vercel deploy` sin `--prod`), con Neon `assa-terremoto-pruebas` y Blob `assa-terremoto-pruebas` propios. Datos de ejemplo: `npm run datos-prueba` |
| Respaldo diario | Cron de Vercel `/api/respaldo` a las 08:00 UTC (3:00 a. m. de Panamá) |

Variables de entorno en Vercel (producción): `DATABASE_URL` (y las de Neon), `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`,
`SESION_SECRETO`. `PANEL_CLAVE` quedó de la primera versión y ya no se usa (se puede borrar). Para pólizas reales se
agregarán `POLIZAS_PROVEEDOR=http`, `POLIZAS_API_URL` y `POLIZAS_API_TOKEN`; para el correo real,
`CORREO_PROVEEDOR=microsoft365`, `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET` y `M365_BUZON`.

## 2. Qué está hecho

### Formulario público (`/`)
- Look and feel de ASSA (logo oficial de `ASSA-Proyects`, azul `#0D2E68`), pensado para celular.
- **¿Quién reporta?** Asegurado, corredor (nombre, código, correo, teléfono) o ejecutivo de ASSA. Si reporta un tercero,
  el contacto del asegurado es opcional y "Registrar otro inmueble" conserva los datos del corredor.
- Datos del asegurado, póliza, unidad (opcional), provincia/comarca y distrito de Panamá, dirección, tipo de inmueble.
- **Daños**: 16 opciones agrupadas y sin solaparse (grietas finas / abiertas / en columnas, vigas o losas, etc.).
- Situación actual: habitabilidad (con criterios concretos), riesgos de seguridad, extensión y, en comercial o
  industrial, operación detenida.
- Relato con ejemplo gris, fecha del daño, hasta 5 fotos (se comprimen en el teléfono) y autorización (Ley 81 de 2019).
- Pantalla final: "¡Gracias por su reporte!" con número `TRM-000123` y enlace a la consulta. **No promete contacto.**

### Prioridad (reglas en `shared/catalogos.ts`)
Mide el **costo estimado para ASSA**, no el riesgo personal del asegurado.
- **Costo estimado** = suma del % de la suma asegurada típico de cada daño (`COSTO_DANO`, referencia: vivienda de
  ~B/.150,000) × extensión (×1, ×2, ×3.5) + operación detenida (+5 %) o parcial (+2 %) en comercial e industrial.
- **Alta**: daño estructural, no habitable respaldado por los daños, o costo ≥ 8 %.
- **Media**: parcialmente habitable respaldado, o costo entre 2 % y 8 % (probablemente supera el deducible).
- **Cierre rápido**: residencial con costo < 2 % (probablemente no supera el deducible del 2 %).
- **Baja**: el resto.
- La habitabilidad declarada solo cuenta si los daños la respaldan; los riesgos (gas, electricidad…) son solo aviso.
- El panel recalcula la prioridad con las reglas vigentes; lo guardado en la base no se modifica.

### Gestión de reclamos (panel)
- **Fases**: Ingresado → Esperando información completa → En análisis → Con analista o ajustador → Pagado / Declinado
  (con motivo). Fecha de inspección opcional.
- **Ficha del caso** con pestañas: Gestión (fase, asignación, notas), Análisis (causa y coberturas con monto
  reclamado, reserva y pagado), Documentos (hasta 25 MB, Blob privado), Póliza, Comunicación (plantillas, abrir
  WhatsApp o correo con el texto listo, registro de contactos), Reporte e Historial.
- **BI**: indicadores, reportes por día, reclamos por fase, días en la fase, canal de ingreso, corredores, montos por
  cobertura, coberturas, causas, reglas activadas, provincias, tipos de daño, exportación CSV.
- **Consulta pública** (`/consulta`): con número de reporte + póliza muestra la fase, sin datos personales.

### Accesos (usuarios y roles, `shared/roles.ts`)
| Rol | Ve | Puede |
|---|---|---|
| Supervisor de reclamos | Todo + BI + Usuarios | Todo, administrar usuarios |
| Analista interno | Todos los reclamos (sin BI) | Fase, asignación, análisis, documentos, comunicación, notas |
| Ajustador externo | **Solo sus casos asignados**, sin costo ni reglas | Análisis, documentos, notas |
| Comercial | Todos los reclamos + BI | Solo lectura |
| Canales | Todos los reclamos | Comunicación, documentos, notas |

- Permisos aplicados en el servidor. Sesión firmada (`SESION_SECRETO`), verificada en cada solicitud; bloqueo de
  15 minutos tras 5 intentos fallidos; auditoría en la tabla `auditoria`.
- **Usuarios de prueba** (las claves se entregaron por chat; si se pierden, un supervisor las restablece en
  *Usuarios*, o se usa `scripts/crear-usuarios-prueba.ts`): `supervisor@prueba.assa`, `analista1@prueba.assa`,
  `analista2@prueba.assa`, `ajustador@prueba.assa`, `comercial@prueba.assa`, `canales@prueba.assa`.

### Pólizas (`api/_polizas.ts`)
- Conector con interfaz única y dos proveedores: **simulado** (activo; datos de prueba deterministas y PDFs de prueba,
  marcado como "Datos simulados") y **http** (listo para el sistema de ASSA; contrato en el README).
- Pestaña Póliza: vigencia frente a la fecha del daño, datos del asegurado y corredor, coberturas con suma asegurada
  y **deducible exacto** (2 %, mínimo $250) comparado con la reserva, y documentos de la póliza.

### Correo (`api/_correo.ts`)
- Conector con interfaz única y dos proveedores: **simulado** (activo) y **microsoft365** (Microsoft Graph, buzón
  compartido; listo, falta el acceso). Detalle en el README.
- **Enviar** desde la pestaña Comunicación con plantillas y asunto editable; la dirección sale del caso y el asunto
  siempre lleva el `TRM-`. En simulado queda en el historial como "enviado (simulado)".
- **Recibir**: el panel lee el buzón cada 2 minutos (y el cron diario); los correos con `TRM-000123` en el asunto se
  asocian al caso, sus adjuntos pasan a Documentos y el caso muestra **Correo nuevo** en la cola (filtro "Con correo
  nuevo") hasta que alguien abre Comunicación o responde. Todo correo leído queda en `correos_recibidos`. En simulado:
  botón "Simular correo entrante".
- **Correos sin caso** (vista *Correos*, con contador): los que llegan sin número se asocian a un caso (con sugerencias
  por remitente o póliza; los adjuntos pasan a Documentos) o se descartan, sin borrar nada.

### Datos que nunca se pierden
- Borrador del formulario en el dispositivo; `ref` única por reporte (los reenvíos no duplican).
- Reintentos en Neon; si no responde, el reporte se guarda en Blob `pendientes/` y el asegurado recibe `P-XXXXXXXX`.
- Cron diario: carga los pendientes y copia reportes + historial a `respaldos/AAAA-MM-DD.json`.
- Migraciones solo aditivas; historial (`reclamo_eventos`) y auditoría solo agregan filas; usuarios no se borran.
- Control de cambios simultáneos: si dos personas cambian el mismo caso, la segunda recibe un aviso (409).

### Avisos automáticos de cambio de fase
- Al pasar a En análisis, Con ajustador (con o sin fecha de inspección) o Pagado, el panel ofrece avisar por correo al
  asegurado y al corredor, con el mensaje a la vista. Declinado y Esperando información los redacta una persona.

### Ingreso automático de reportes por correo
- Un correo que reporta daños se lee, se completa con la póliza y se valida con las reglas del formulario: si está completo
  se crea el reclamo (canal "correo") y se responde con el número; si falta algo, se responde pidiéndolo (reporte `B-000123`)
  y la respuesta del remitente completa el reporte. Detalle y salvaguardas en el README.
- Lectura en modo `simulado` (reglas). Modo `claude` listo (Claude Opus 5.5, salida estructurada), falta la decisión de ASSA
  (pregunta 6) y la `ANTHROPIC_API_KEY`.
- Las simulaciones de correo solo funcionan en el ambiente de pruebas (la API las rechaza en producción).

### Disponibilidad
- Límite de envíos por IP en el formulario (60 cada 10 min) y en la consulta pública (30 cada 10 min); si la base de
  datos falla, deja pasar.
- `GET /api/salud` para monitoreo externo (503 si cae la base de datos o Blob) y aviso en el panel para supervisores.
- Prueba de 200 reportes simultáneos con reenvíos (local).

### Diseño
- Panel con encabezado fijo, avatar, Reclamos / BI / Usuarios. En celular: menú hamburguesa, filtros plegables,
  indicadores deslizables, cola en tarjetas y ficha a pantalla completa.

## 3. Arquitectura

- **Frontend**: Vite + React + TypeScript. Tres páginas: `index.html` (formulario, `src/App.tsx`),
  `panel.html` (`src/panel/*`), `consulta.html` (`src/consulta/*`).
- **API**: funciones de Vercel en `api/` (archivos con `_` no son rutas):
  - `reclamos.ts` (recibe el formulario), `consulta.ts` (estado público), `respaldo.ts` (cron)
  - `sesion.ts`, `usuarios.ts`, `_sesion.ts` (accesos y auditoría)
  - `panel.ts` (lista y archivos), `gestion.ts` (acciones sobre casos), `documentos.ts` (token de subida a Blob)
  - `polizas.ts` + `_polizas.ts` (conector de pólizas), `correo.ts` + `_correo.ts` (conector de correo),
    `_ingresoCorreo.ts` + `_extractor.ts` (reclamos creados desde correos), `_validacion.ts` (reglas del formulario),
    `salud.ts` (monitoreo), `_limites.ts` (límite por IP), `_db.ts` (esquema y migraciones)
- **Compartido** (`shared/`): `catalogos.ts` (provincias, daños, prioridad), `flujo.ts` (fases, coberturas, causas,
  documentos, plantillas), `roles.ts` (permisos).
- **Tablas**: `reclamos_terremoto`, `reclamo_eventos`, `usuarios`, `auditoria`, `correos_recibidos`, `limites` (se crean
  y migran solas en `_db.ts`).

## 4. Lo que sigue (en este orden)

### 4.1 Correo real
- Al tener el acceso de TI: configurar las variables `M365_*`, poner `CORREO_PROVEEDOR=microsoft365` y probar con el
  buzón real.

### 4.2 Parte técnica ("no se puede caer"), lo que falta
- Configurar un monitor externo (UptimeRobot o Better Stack, gratis) sobre `/api/salud` con alertas por correo/SMS.
- Prueba de carga contra el ambiente de pruebas (ya existe).
- Conectar Vercel a GitHub para publicar automáticamente (el ambiente de pruebas ya está listo). Antes hay que crear
  la rama `main` y fijarla como rama de producción en Vercel: hoy la única rama de GitHub es la de trabajo, y si se
  conecta así, cada push iría directo a producción.
- Revisar planes de Vercel y Neon frente al volumen; confirmar los días de restauración de Neon (PITR).

### 4.3 Documento para TI de ASSA
Listo en `docs/TI-ASSA.md`: contrato de la API de pólizas, registro de la app en Azure (Graph `Mail.Send` y
`Mail.ReadWrite`, limitada al buzón con una *application access policy*) y login con Microsoft (opcional). Falta poner
el contacto técnico y enviarlo.

## 5. Preguntas abiertas para ASSA
1. Lista oficial de coberturas de los productos afectados (hoy se usa una estándar en `shared/flujo.ts`).
2. Validar con un ajustador los costos estimados por tipo de daño (`COSTO_DANO`).
3. ¿Comercial ve todos los reclamos o solo los de sus corredores?
4. ¿Los ajustadores externos pueden ver costo estimado y prioridad? (Hoy no.)
5. Dirección del buzón compartido de reclamos en Microsoft 365.
6. ¿Se aprueba enviar el contenido de los correos a la API de Anthropic (Claude) para leerlos? Son datos personales (Ley 81
   de 2019); sin esa aprobación el ingreso por correo usa reglas simples, que entienden menos variaciones de redacción.
7. ¿Basta con que el remitente responda «Autorizo» por correo como autorización de uso de datos, o Legal pide otro texto?

## 6. Decisiones y preferencias del usuario (respetarlas)
- Todo en español. Nunca usar la palabra "triage".
- La pantalla final del formulario no promete contacto; solo agradece.
- **Los datos nunca se deben perder**: no borrar, migraciones aditivas, no cargar datos de prueba en producción.
- La prioridad es por costo para ASSA; buscar "cierres rápidos" (bajo deducible); la habitabilidad declarada sin
  daños que la respalden no sube la prioridad.
- Las integraciones sin acceso (pólizas, Microsoft 365) se construyen con conector + modo simulado.
