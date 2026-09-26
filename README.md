# Cosa Nostra / The Godfather Club — App completa

Una sola app **Next.js + Prisma (SQLite) + PWA**:

- Ranking real (78 jugadores, 4 torneos)
- Badges de estatus (Don, Capo, Consigliere, Leyenda, Invicto, Veterano, Promesa)
- Ficha de jugador (modal)
- Auth segura (bcrypt + sesión)
- Admin / importación BetaDomino
- Base de datos local SQLite

## Arranque (primera vez)

```bash
cd cosa-nostra

npm install

# Genera cliente Prisma, crea DB y carga datos reales
npm run db:setup:real

# Servidor (PWA + API en el mismo puerto)
npm run dev
```

Abre **http://localhost:3000**

### En el teléfono (misma Wi-Fi)

1. Arranca `npm run dev` en el PC
2. En el móvil: `http://IP-DE-TU-PC:3000`

## Credenciales

| Rol   | Email                     | Contraseña      |
|-------|---------------------------|-----------------|
| Admin |    | |
| Demo  | jugador1@cosanostra.club  | cosa2026        |

En el login deja vacía la URL del API.

## Scripts

- `npm run dev` — desarrollo
- `npm run db:setup:real` — DB + seed real
- `npm run db:seed:real` — solo re-seed
- `npm run build && npm start` — producción

## P0 incluido

- Skeleton + empty states
- Badges en ranking y modal
- PlayerDetailModal
- Ranking/torneos desde Prisma (fallback data.js)

No hace falta correr cosa-nostra-pwa/server.js por separado.


## Notificaciones push

Web Push (VAPID) integrado:

1. Claves en `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
2. Tras cambiar el schema: `npx prisma db push`
3. Instalar dependencia: `npm install` (incluye `web-push`)
4. En el móvil/desktop (HTTPS o localhost): banner **Activar** avisos
5. Admin → **Enviar prueba** para validar

Regenerar claves VAPID:

```bash
npm run push:vapid
```

Copia las claves a `.env` y reinicia el servidor.

**Requisitos:** HTTPS (o localhost), Service Worker activo, permiso del usuario.


## Notificaciones in-app

Centro de avisos en la app (campana en la barra superior):

- Lista de notificaciones (globales + personales)
- Contador de no leídas
- Marcar como leídas (una o todas)
- Toasts para feedback inmediato
- Al enviar push desde Admin también se crea aviso in-app

APIs:

- `GET /api/notifications`
- `POST /api/notifications` (admin)
- `POST /api/notifications/read`

Tras actualizar el schema:

```bash
npx prisma db push
npm run db:seed:real   # opcional: avisos de bienvenida
```


## Service Worker + Web Push (detalle)

El `public/sw.js` gestiona:

- Cache offline (PWA)
- Evento `push` → muestra notificación del sistema
- `notificationclick` → enfoca/abre la app
- `pushsubscriptionchange` → pide re-suscripción al cliente
- Mensajes `SKIP_WAITING` / `PUSH_NAVIGATE`

Registro en `index.html` solo en **HTTPS** o **localhost**.


## Admin CRUD (gestión de datos)

Con sesión **don/admin** puedes:

| Sección | Acciones |
|---------|----------|
| Jugadores | Crear, editar, eliminar/desactivar |
| Torneos | Crear, editar, eliminar (cascade resultados) |
| Avisos | Publicar, editar, eliminar |
| Import | BetaDomino (existente) |
| Push | Prueba de notificación |

APIs (todas con `requireAdmin`):

- `/api/admin/players` · `/api/admin/players/[id]`
- `/api/admin/tournaments` · `/api/admin/tournaments/[id]`
- `/api/admin/notifications/[id]`
- `POST /api/notifications` (crear)

Las páginas admin redirigen a **login** si no hay rol administrador.
