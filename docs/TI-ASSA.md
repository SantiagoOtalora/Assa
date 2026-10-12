# Integraciones de la plataforma de reclamos por sismo · Lo que necesitamos de TI de ASSA

La plataforma de reclamos por sismo (formulario público, consulta de estado y panel interno) ya funciona en producción. Dos
integraciones están construidas y probadas en **modo simulado**, y se activan cambiando variables de configuración en
cuanto TI entregue los accesos de abajo. No hace falta cambiar código.

| # | Integración | Qué necesitamos | Para qué |
|---|---|---|---|
| 1 | Sistema de pólizas | Una API de solo lectura y un token | Ver vigencia, coberturas, sumas aseguradas, deducibles y documentos de la póliza en cada caso |
| 2 | Correo Microsoft 365 | Un buzón compartido y una app registrada en Azure | Enviar correos a asegurados y corredores desde el panel y asociar sus respuestas al caso |
| 3 | Inicio de sesión con Microsoft (opcional) | Una app registrada en Entra ID | Que el personal de ASSA entre con su cuenta corporativa |

---

## 1. API de pólizas (solo lectura)

**Cómo se conecta:** la plataforma llama por HTTPS con `Authorization: Bearer <token>` y espera la respuesta como máximo
8 segundos. Solo consulta pólizas de reclamos existentes, cuando un usuario abre la pestaña *Póliza* de un caso; cada
consulta queda en la auditoría.

**Rutas:**

```
GET {URL_BASE}/polizas/{numero}                  -> 200 JSON (abajo) | 404 si no existe
GET {URL_BASE}/polizas/{numero}/documentos/{id}  -> 200 archivo (PDF u otro, con content-type y content-disposition) | 404
```

**Respuesta de `/polizas/{numero}`** (montos en USD, fechas `AAAA-MM-DD`):

```json
{
  "numero": "02-B-123",
  "estado": "vigente",
  "producto": "Hogar Seguro",
  "ramo": "Incendio y líneas aliadas",
  "vigenciaDesde": "2026-01-01",
  "vigenciaHasta": "2026-12-31",
  "moneda": "USD",
  "asegurado": { "nombre": "…", "identificacion": "…", "correo": "…", "telefono": "…" },
  "corredor": { "nombre": "…", "codigo": "…", "correo": "…" },
  "ubicacionRiesgo": "…",
  "coberturas": [
    {
      "id": "edificio",
      "titulo": "Edificio o estructura",
      "sumaAsegurada": 150000,
      "deducibleTerremoto": { "porcentaje": 2, "minimo": 250 }
    }
  ],
  "documentos": [{ "id": "condiciones", "nombre": "Condiciones particulares.pdf", "tipo": "application/pdf", "fecha": "2026-01-01" }]
}
```

- `estado`: `vigente`, `vencida` o `cancelada`. `corredor` puede ser `null`. `deducibleTerremoto` puede ser `null` si la
  cobertura no tiene terremoto.
- `coberturas[].id` debe ser uno de: `edificio`, `contenido`, `maquinaria`, `mercancia`, `interrupcion`, `remocion`,
  `gastos_extra`, `vidrios`, `rc`, `otra`. Si sus productos tienen otras coberturas, envíennos la lista oficial y la
  agregamos.
- El número de póliza llega normalizado: en mayúsculas y sin espacios.

**Lo que TI nos entrega:** la URL base (idealmente un ambiente de pruebas primero) y un token de solo lectura.

---

## 2. Correo con Microsoft 365

**Qué hace la plataforma:**
- **Envía** correos desde el buzón compartido (por ejemplo `reclamos-sismo@assa.com.pa`) a asegurados y corredores. El
  asunto siempre lleva el número del reclamo (`TRM-000123`).
- **Lee** cada 2 minutos los correos no leídos de la bandeja de entrada de ese buzón. Los que traen el número en el asunto
  se asocian al caso y sus adjuntos pasan a los documentos; los demás quedan en una bandeja del panel para asignarlos a
  mano. Después de guardar cada correo lo marca como leído. **No borra ni mueve correos.**

**Registro de la aplicación en Azure (Entra ID):**
1. *App registrations → New registration*, por ejemplo con el nombre "Reclamos sismo". Cuenta de un solo tenant y sin URI de
   redirección.
2. *API permissions → Microsoft Graph → Application permissions*: **`Mail.Send`** y **`Mail.ReadWrite`**. Después,
   **Grant admin consent**. Se pide `Mail.ReadWrite` y no `Mail.Read` porque la app marca los correos como leídos.
3. *Certificates & secrets → New client secret* (sugerimos 12 o 24 meses; avísennos antes de que venza).
4. **Limitar la app solo al buzón compartido** con una *application access policy* de Exchange Online, para que no pueda
   leer ningún otro buzón:
   ```powershell
   New-DistributionGroup -Name "App Reclamos Sismo" -Type Security -Members reclamos-sismo@assa.com.pa
   New-ApplicationAccessPolicy -AppId <CLIENT_ID> -PolicyScopeGroupId "App Reclamos Sismo" `
     -AccessRight RestrictAccess -Description "Solo el buzón de reclamos por sismo"
   Test-ApplicationAccessPolicy -Identity reclamos-sismo@assa.com.pa -AppId <CLIENT_ID>
   ```
   (Si usan RBAC for Applications de Exchange, el equivalente es un *management scope* con el mismo alcance.)

**Lo que TI nos entrega** (el secreto por un canal seguro, no por correo):

| Dato | Variable en la plataforma |
|---|---|
| Directory (tenant) ID | `M365_TENANT_ID` |
| Application (client) ID | `M365_CLIENT_ID` |
| Client secret (valor) | `M365_CLIENT_SECRET` |
| Dirección del buzón compartido | `M365_BUZON` |

---

## 3. Inicio de sesión con Microsoft (opcional)

Hoy cada persona entra al panel con su correo y una clave propia de la plataforma, con roles y auditoría. Si ASSA prefiere
que el personal interno entre con su cuenta corporativa (con MFA y bajas automáticas cuando alguien sale de la empresa),
necesitamos:
- Una app registrada en Entra ID para OpenID Connect, con la URI de redirección
  `https://assa-terremoto.vercel.app/api/sesion/microsoft` (la ruta se construye cuando se decida activarlo; el dominio
  puede cambiar si ASSA usa uno propio).
- Tenant ID, client ID y un secreto.
- Opcional: grupos de Entra ID que correspondan a los roles (supervisor, analista, comercial, canales).

Los ajustadores y corredores externos seguirían entrando con correo y clave.

---

## Seguridad y datos

- **Hosting:** Vercel. **Base de datos:** Neon Postgres. **Archivos:** Vercel Blob privado (fotos y documentos se sirven solo
  con sesión).
- Secretos guardados como variables cifradas de Vercel; nunca en el código.
- Permisos por rol aplicados en el servidor; auditoría de accesos, consultas de póliza, documentos vistos y correos.
- Respaldo diario completo (reportes, historial y correos) y migraciones que solo agregan: no se borran datos.
- Límite de solicitudes en las rutas públicas y ruta de salud (`/api/salud`) para monitoreo.

**Contacto técnico:** [nombre, correo y teléfono]
