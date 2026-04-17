# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Descripción del Proyecto

Sistema ERP de gestión de crédito y cobranza para **Novedades Cancún** (Tuxtepec, Oaxaca). Maneja ventas a crédito de productos del hogar, cobranza en ruta, comisiones, cortes semanales y seguimiento de clientes.

## Despliegue

| Servicio | Plataforma | URL / ID |
|---|---|---|
| Frontend | Vercel | https://sistema-cobranza-hazel.vercel.app |
| Backend | Render | `srv-d7alvsedqaus73bmc650` → `https://srv-d7alvsedqaus73bmc650.onrender.com` |
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
│   │   ├── schema.prisma          # 17 modelos de datos
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

El middleware `auth.js` inyecta `req.usuario` con `{ id_usuario, rol, ruta_asignada }`.

| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/auth/login` | Devuelve JWT válido 12h |
| GET/POST/PUT | `/api/clientes` | Cobradores ven solo su ruta |
| POST | `/api/clientes/importar-lote` | Solo admin, formato XLSX |
| POST | `/api/clientes/geocodificar-lote` | Google Geocoding server-side |
| PUT | `/api/clientes/:id/coordenadas` | Guardar lat/lng |
| PUT | `/api/clientes/:id/plus-code` | Generar/guardar Plus Code desde coordenadas |
| GET/POST/PUT | `/api/ventas` | |
| GET | `/api/pagos/cartera/:id_cobrador` | Cuentas activas/atraso/moroso del cobrador |
| GET | `/api/pagos/cuenta/:id` | Detalle con últimos 10 pagos |
| GET | `/api/pagos/todas-cuentas` | Filtrado por ruta si es cobrador |
| POST | `/api/pagos` | Registrar pago, actualiza saldo y comisiones |
| PUT | `/api/pagos/cuenta/:id/frecuencia` | Frecuencia + horario preferido |
| GET/POST/PUT | `/api/cuentas` | Cambio de plan, reestructuras |
| GET/POST/PUT | `/api/productos` | |
| GET/POST/PUT | `/api/usuarios` | |
| GET | `/api/dashboard/resumen` | KPIs del día |
| GET/POST | `/api/cortes` | Cortes cobrador y vendedor |
| GET/POST | `/api/visitas` | Seguimientos y visitas programadas |
| POST/GET | `/api/uploads/fachada/:id` | Foto de fachada en base64 |

## Roles y Acceso

| Rol | Acceso |
|---|---|
| `administrador` | Todo |
| `secretaria` | Clientes, Productos, Ventas |
| `vendedor` | Clientes, Productos, Ventas |
| `cobrador` | Cobranza, Visitas, Mapa (filtrado por `ruta_asignada`) |
| `jefe_camioneta` | Clientes, Productos, Ventas, Mapa |

Cobradores y jefe_camioneta reciben datos filtrados por `ruta_asignada` en clientes, cuentas y mapa.

## Reglas del Negocio

### Ventas y Enganche
- **Enganche objetivo** = 10% del `precio_final_total`
- Si `enganche_recibido < enganche_objetivo` → el resto queda como **enganche regado** (pendiente de recuperar)
- **Sobreenganche** = `enganche_recibido - enganche_objetivo` (si pagó de más)
- `monto_reportado_negocio` = `precio_final_total - enganche_para_vendedor`
- Planes: `contado_directo`, `un_mes`, `dos_meses`, `tres_meses`, `largo_plazo`

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

### Plus Codes
- Se generan en el **frontend** con `open-location-code` (sin llamada a API)
- El backend puede generarlos desde coordenadas almacenadas vía `PUT /clientes/:id/plus-code`
- La misma `VITE_GOOGLE_MAPS_KEY` sirve para el mapa, geocodificación y Plus Codes

### PWA Offline
- Cachea: `/api/pagos/todas-cuentas`, `/api/clientes`, `/api/pagos/cuenta/:id`
- Strategy: `NetworkFirst` con timeout de 5s, fallback a caché
- Crítico para cobradores que trabajan sin conexión estable

## Convenciones de Código

- Backend: CommonJS (`require/module.exports`), un `PrismaClient` por archivo de ruta
- Frontend: ESModules, componentes funcionales con hooks, Tailwind para estilos
- IDs en BD: prefijo descriptivo (`id_cliente`, `id_venta`, `id_cobrador`, etc.)
- Todos los montos monetarios: `Decimal @db.Decimal(10,2)` en Prisma
- Fechas: siempre guardadas en UTC, mostradas en `es-MX`
- El frontend usa `api.js` (Axios) para todas las llamadas — nunca `fetch` directamente excepto Google Maps API

## Estado Actual

- Plus Codes implementados: campo en formulario, botón GPS local (open-location-code), verificación, mapa y expediente
- PWA configurada con caché offline para cobradores
- Importación masiva de clientes desde XLSX
- Foto de fachada de clientes (base64 en BD)
- Listado de cuentas con exportación CSV
- Ordenamiento en listado de cuentas
