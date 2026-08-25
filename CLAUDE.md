# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Descripción del Proyecto

Sistema ERP de gestión de crédito y cobranza para **Novedades Cancún** (Tuxtepec, Oaxaca). Maneja ventas a crédito de productos del hogar, cobranza en ruta, comisiones, cortes semanales y seguimiento de clientes.

## Despliegue

| Servicio | Plataforma | URL / ID |
|---|---|---|
| Frontend | Vercel | https://sistema-cobranza-hazel.vercel.app |
| Backend | Render | `cobranza-backend-p8gs` → `https://cobranza-backend-p8gs.onrender.com` |
| Base de datos | Supabase (PostgreSQL) | AWS Sa-East-1 |

### Variables de entorno

**Frontend (Vercel):**
- `VITE_GOOGLE_MAPS_KEY` — API Key de Google Maps (mapas interactivos, geocodificación, Plus Codes)
- `VITE_API_URL` — URL del backend en Render (`/api` incluido)

**Backend (Render):**
- `DATABASE_URL` — Supabase pooling (PgBouncer, puerto 6543)
- `DIRECT_URL` — Supabase directo (puerto 5432, para migraciones)
- `JWT_SECRET` — Firma de tokens JWT
- `GOOGLE_MAPS_KEY` — Geocodificación server-side
- `PORT` — 3000

## Comandos frecuentes

```bash
# Backend
cd backend
npm run dev          # nodemon src/index.js
npm start            # prisma migrate deploy && node src/index.js (producción)

# Migraciones
cd backend
npx prisma migrate dev --name nombre_migracion   # nueva migración (desarrollo)
npx prisma migrate deploy                         # aplicar en producción
npx prisma generate                               # regenerar cliente Prisma

# Frontend
cd frontend
npm run dev          # Vite dev server
npm run build        # build de producción
```

## Stack Tecnológico

**Frontend:** React 18 + Vite + Tailwind CSS + React Router v7 + Axios + `@react-google-maps/api` + `open-location-code` + vite-plugin-pwa (Workbox)

**Backend:** Node.js + Express 5 + Prisma 6 + bcryptjs + jsonwebtoken + multer + xlsx

**DB:** PostgreSQL vía Supabase + Prisma ORM

## Arquitectura

```
sistema-cobranza/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # 19 modelos de datos
│   │   └── migrations/
│   └── src/
│       ├── index.js               # Entry point Express
│       ├── middlewares/auth.js    # JWT middleware → req.usuario
│       └── routes/                # Un archivo por recurso
│           ├── auth.js, clientes.js, ventas.js, pagos.js
│           ├── cuentas.js, productos.js, usuarios.js
│           ├── cortes.js, visitas.js, dashboard.js, uploads.js
└── frontend/
    └── src/
        ├── api.js                 # Axios instance con baseURL y token interceptor
        ├── context/AuthContext.jsx
        ├── components/Layout.jsx
        └── pages/
            ├── auth/Login.jsx
            ├── clientes/Clientes.jsx   # CRUD + geocodificación + Plus Codes + XLSX import
            ├── ventas/Ventas.jsx
            ├── cobranza/Cobranza.jsx   # Vista dedicada para cobradores
            ├── mapa/Mapa.jsx           # Google Maps con marcadores de clientes
            ├── cortes/Cortes.jsx
            ├── visitas/Visitas.jsx
            ├── productos/Productos.jsx
            ├── usuarios/Usuarios.jsx
            ├── dashboard/Dashboard.jsx
            └── listado/Listado.jsx
```

## Rutas del Backend

Todas las rutas excepto `POST /api/auth/login` requieren `Authorization: Bearer <token>`.

El middleware `auth.js` solo usa el JWT para probar identidad (`decoded.id`); en cada request vuelve a leer `rol`, `rutas_asignadas` (array, un cobrador puede tener varias rutas) y `activo` frescos de la BD e inyecta `req.usuario = { id, nombre, rol, rutas_asignadas }`. Así un cambio de rol/rutas/desactivación hecho por el admin aplica de inmediato, sin esperar a que expire el token viejo (12h).

| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/auth/login` | Devuelve JWT válido 12h |
| GET/POST/PUT | `/api/clientes` | Cobradores ven solo sus rutas asignadas |
| POST | `/api/clientes/importar-lote` | Solo admin, formato XLSX |
| POST | `/api/clientes/geocodificar-lote` | Google Geocoding server-side |
| PUT | `/api/clientes/:id/coordenadas` | Guardar lat/lng |
| PUT | `/api/clientes/:id/plus-code` | Generar/guardar Plus Code desde coordenadas |
| GET/POST/PUT | `/api/ventas` | |
| GET | `/api/pagos/cartera/:id_cobrador` | Cuentas activas/atraso/moroso del cobrador |
| GET | `/api/pagos/cuenta/:id` | Detalle con últimos 10 pagos |
| GET | `/api/pagos/todas-cuentas` | Filtrado por rutas si es cobrador |
| GET | `/api/pagos/por-fecha?fecha=YYYY-MM-DD` | Cobros del día agrupados por cobrador (admin/supervisor/secretaria) |
| POST | `/api/pagos` | Registrar pago, actualiza saldo y comisiones. Acepta `idempotency_key` opcional (ver Confiabilidad offline) |
| GET | `/api/pagos/comentarios` | Pagos con `observaciones` no leídas, admin/supervisor (para el panel de Dashboard) |
| PUT | `/api/pagos/:id/marcar-leido` | Marca un comentario de pago como leído |
| PUT | `/api/pagos/comentarios/marcar-todos-leidos` | Marca todos los comentarios pendientes como leídos |
| PUT | `/api/pagos/cuenta/:id/frecuencia` | Frecuencia + horario preferido |
| GET/POST/PUT | `/api/cuentas` | Cambio de plan, reestructuras |
| GET/POST/PUT | `/api/productos` | |
| GET/POST/PUT | `/api/usuarios` | |
| GET | `/api/dashboard/resumen` | KPIs del día |
| GET/POST | `/api/cortes` | Cortes cobrador y vendedor |
| GET | `/api/cortes/cobrador/resumen/:id_cobrador?fecha_inicio&fecha_fin` | Sin parámetros = semana actual (lun-dom, calculada en horario México); con parámetros = rango libre |
| GET/POST | `/api/visitas` | Seguimientos y visitas programadas. POST acepta `idempotency_key` opcional |
| POST/GET | `/api/uploads/fachada/:id` | Foto de fachada en base64 |

## Roles y Acceso

| Rol | Acceso |
|---|---|
| `administrador` | Todo |
| `supervisor_cobranza` | Igual que administrador, pero redirige a `/cobranza` al login y aparece en cortes como cobrador |
| `secretaria` | Clientes, Productos, Ventas |
| `vendedor` | Clientes, Productos, Ventas |
| `cobrador` | Cobranza, Visitas, Mapa (filtrado por `rutas_asignadas`) |
| `jefe_camioneta` | Clientes, Productos, Ventas, Mapa |

Cobradores y jefe_camioneta reciben datos filtrados por `rutas_asignadas` (array — un cobrador puede tener más de una ruta) en clientes, cuentas y mapa.

## Reglas del Negocio

### Ventas y Enganche
- **Enganche objetivo** = 10% del `precio_final_total`
- Si `enganche_recibido < enganche_objetivo` → el resto queda como **enganche regado** (pendiente de recuperar)
- **Sobreenganche** = `enganche_recibido - enganche_objetivo` (si pagó de más)
- `monto_reportado_negocio` = `precio_final_total - enganche_para_vendedor`
- Planes: `contado_directo`, `un_mes`, `dos_meses`, `tres_meses`, `largo_plazo`

### Descuentos por Plan
- **Plan 1 mes (`un_mes`):** 30% de descuento sobre `precio_original_total`
- `precio_final_total` = `precio_original_total × 0.70`
- `saldo_inicial` = `precio_final_total - abono_inicial`
- `saldo_actual` = `precio_final_total - total_abonado` (enganche + pagos registrados)

### Comisiones
- **Cobrador:** 12% de cada pago registrado (por defecto)
- **Vendedor:** Comisión basada en recuperación de enganche regado
  - Estados: `pendiente_recuperacion` → `lista_para_corte` → `pagada`
- Cortes de vendedor: tipo `cinco` (día 5) o `veinte` (día 20)

### Cuentas
- Al crear una venta a plazo se genera automáticamente una `Cuenta`
- `semanas_atraso` se incrementa si no hay pagos en tiempo
- `nivel_reestructura` registra cuántas veces se reestructuró la cuenta
- `beneficio_vigente` = false si el cliente no cumple condiciones de plan

### Comentarios de cobranza
- El campo `Pago.observaciones` (texto libre que deja el cobrador al registrar un pago) tiene un flag `observacion_leida` (default `false`). Admin/supervisor lo ven en el Dashboard (panel "Comentarios de cobranza") y en el badge del menú lateral, para enterarse sin depender de que el cobrador avise aparte.
- Los pagos históricos previos a esta función se marcaron `observacion_leida = true` en la migración (no generan backlog falso al activarla).

### Plus Codes
- Se generan en el **frontend** con `open-location-code` (sin llamada a API)
- El backend puede generarlos desde coordenadas almacenadas vía `PUT /clientes/:id/plus-code`
- La misma `VITE_GOOGLE_MAPS_KEY` sirve para el mapa, geocodificación y Plus Codes

### PWA Offline
- Cachea: `/api/pagos/todas-cuentas`, `/api/clientes`, `/api/pagos/cuenta/:id`, `/api/ventas`, `/api/visitas/cuenta/:id`, `/api/visitas` (agenda)
- Strategy: `NetworkFirst` con timeout de 5s, fallback a caché
- Crítico para cobradores que trabajan sin conexión estable
- Cola de escritura offline (`frontend/src/utils/offlineQueue.js`): pagos, visitas, cambios de día de cobranza y ubicaciones se guardan en `localStorage` cuando falla la red (`navigator.onLine === false` o timeout/error sin `err.response`) y se reintentan solos al reconectar o cada 60s. Distingue error de red (`errorEsDeRed: true`, se reintenta en silencio) de rechazo real del servidor (`errorEsDeRed: false`, se muestra al usuario para revisión manual).
- "Actualizar app" (botón en el sidebar) borra el service worker y cachés de código, pero preserva las cachés de datos (`CACHES_DE_DATOS` en `Layout.jsx`) para no dejar a un cobrador sin nada guardado si se queda sin señal justo después.

### Confiabilidad de escrituras — idempotencia
- Con señal intermitente (no offline total), un `POST /pagos` o `POST /visitas` puede llegar a guardarse en el servidor pero la respuesta se pierde antes de volver al cliente; la app lo interpreta como fallo y lo reintenta (directo o vía cola offline), duplicando el registro.
- Ambos modelos (`Pago`, `SeguimientoCliente`) tienen `idempotency_key String? @unique`. El frontend genera un `crypto.randomUUID()` una sola vez por intento de guardado (antes del primer `try`) y lo reutiliza en todos los reintentos de ese mismo intento (directo, cola, resincronización).
- El backend, si recibe un `idempotency_key` que ya existe, devuelve el registro existente (200) en vez de crear uno nuevo — tanto en una verificación previa como en el `catch` (por si dos reintentos chocan casi al mismo tiempo contra el índice único, error P2002).
- **Pendiente conocido:** esto no cubre una condición de carrera distinta y no resuelta — en `POST /pagos` el saldo de la cuenta se lee y se escribe en dos pasos separados sin transacción/lock; dos pagos *reales y distintos* casi simultáneos en la misma cuenta podrían pisarse el saldo. Baja probabilidad con el volumen actual de cobradores, pero si crece el equipo conviene envolver ese bloque en `prisma.$transaction`.

## Convenciones de Código

- Backend: CommonJS (`require/module.exports`), un `PrismaClient` por archivo de ruta
- Frontend: ESModules, componentes funcionales con hooks, Tailwind para estilos
- IDs en BD: prefijo descriptivo (`id_cliente`, `id_venta`, `id_cobrador`, etc.)
- Todos los montos monetarios: `Decimal @db.Decimal(10,2)` en Prisma
- Fechas: siempre guardadas en UTC, mostradas en `es-MX` con `timeZone: 'America/Mexico_City'` explícito
- México City es UTC-6 permanente (eliminó horario de verano en nov 2022); los filtros de fecha usan offset `-06:00`
- El frontend usa `api.js` (Axios) para todas las llamadas — nunca `fetch` directamente excepto Google Maps API

## Scripts de corrección de datos

Scripts `.cjs` en `backend/` para correcciones puntuales de BD. Se ejecutan con `node <script>.cjs` desde la carpeta `backend/`. Requieren `.env` con `DATABASE_URL`. Convención: mostrar estado actual y cálculo antes de aplicar; abortar si hay condición inesperada.

## Estado Actual

- Plus Codes implementados: campo en formulario, botón GPS local (open-location-code), verificación, mapa y expediente
- PWA configurada con caché offline para cobradores
- Importación masiva de clientes desde XLSX
- Foto de fachada de clientes (base64 en BD)
- Listado de cuentas con exportación CSV
- Ordenamiento en listado de cuentas
- Rol `supervisor_cobranza` implementado (migración aplicada en BD)
- Filtros y ordenamiento en Cobranza (municipio, colonia, nombre, saldo, estado)
- Modo cobranza con checklist de clientes visitados (in-memory, sin persistencia)
- Consulta de cobros por fecha en Dashboard (admin/supervisor/secretaria)
- Ticket de comprobante al registrar pago (popup HTML imprimible); popup bloqueado no causa error falso
- Zona horaria: todos los `toLocaleDateString` usan `timeZone:'America/Mexico_City'`; `GET /pagos/por-fecha` filtra con offset `-06:00`
- Logo de Novedades Cancún en ticket HTML imprimible (cargado desde `/logo.png` vía `window.location.origin`)
- Compartir ticket con RawBT: texto plano (sin imagen para evitar marca de agua de versión gratuita)
- Auto-procesamiento de planes vencidos al abrir Dashboard: admin/supervisor llama `POST /cuentas/procesar-vencimientos` si `planes_vencidos > 0`; muestra banner verde con conteo de cuentas actualizadas
- Fix enganche objetivo: usa `precio_final_total` como base (no `precio_original`) tanto en frontend (`useMemo`) como en backend (`ventas.js`)
- Fix cálculo de ventas en tiempo real: reemplazado `useEffect + setState` por `useMemo` en `Ventas.jsx` para eliminar estado obsoleto (stale closure)
- Cobrador puede tener varias `rutas_asignadas` (antes solo una `ruta_asignada`)
- Día de cobranza por cliente (`dia_cobranza`) con "Organizar mi tarjetero" en Cobranza: orden manual por día de la semana
- Búsqueda por número de cuenta en Ventas/Listado: fix de coincidencia por prefijo (antes "1-C" también matcheaba "11-C", "21-C", "101-C")
- Cambios de rol/rutas hechos por el admin aplican de inmediato (antes requerían que el usuario afectado cerrara sesión) — `auth.js` revalida contra la BD en cada request en vez de confiar en el payload del JWT
- Endurecimiento offline: timeouts explícitos en llamadas de escritura, cola offline también se activa ante error de red con `navigator.onLine === true` (señal débil, no solo offline total), fallback a datos ya cargados en lista cuando el detalle de una cuenta no está en caché, reintento periódico de sincronización cada 60s, "Actualizar app" ya no borra las cachés de datos
- Idempotencia en `POST /pagos` y `POST /visitas` (`idempotency_key`) para eliminar pagos/visitas duplicados por reintentos con señal intermitente — ver sección "Confiabilidad de escrituras"
- Corrección puntual de datos: eliminados 20 pagos duplicados históricos (14 cuentas, ~$2,100) causados por este mismo problema, antes de tener la protección
- Fix ticket de liquidación: si el navegador bloqueaba el popup, el modal ya se había cerrado y el error quedaba invisible; ahora el modal permanece abierto y usa el mismo botón "Ver comprobante" que un pago normal
- Teléfono de la empresa en el pie del ticket de pago
- Dashboard: "Consultar cobros por fecha" con detalle expandible por cobrador individual (antes mostraba todos los pagos juntos)
- Panel "Comentarios de cobranza" + badge de no leídos en el menú (ver sección "Comentarios de cobranza")
- Corte cobrador: columna de número de cuenta y hora del pago; exportación a PDF (vía ventana de impresión, mismo patrón que el ticket); columna "Saldo actual" en vez de "Comisión"; pagos ordenados por número de cuenta ascendente (no alfabético); selector de rango de fechas libre (antes fijo a la semana en curso) con cálculo de semana en horario México (antes usaba la hora cruda del servidor, se podía recorrer de semana cerca de medianoche)
- Fix zona horaria "hoy" en `GET /dashboard/resumen` (Ventas hoy/Cobrado hoy mostraban $0 después de las 6pm hora México) y en los `date` inputs de Dashboard/Cobranza/Ventas/Listado — todos usan fecha local en vez de `toISOString()` (que refleja la zona del servidor/navegador)

## Scripts de utilidad (raíz del proyecto)

- `generar-catalogo.js` — genera `catalogo-novedades-cancun-2026.pdf` con puppeteer
  - Lee productos activos de la BD agrupados por categoría
  - Una página A4 por producto: placeholder de imagen, precios, pagos semanales por plan
  - **Precio Credicontado** = `precio_original × 0.70` (30% descuento contado)
  - Pago 1 mes = `Math.ceil(precio_original × 0.70 / 4)` (redondeado arriba, sin centavos)
  - Pagos 2/3 meses y largo plazo: leídos de campos del producto (`pago_semanal_2_meses`, etc.)
  - Dependencias: puppeteer en `node_modules/` raíz, dotenv y Prisma desde `backend/node_modules/`
  - Ejecutar: `node generar-catalogo.js` desde la raíz (cerrar el PDF antes de regenerar)
