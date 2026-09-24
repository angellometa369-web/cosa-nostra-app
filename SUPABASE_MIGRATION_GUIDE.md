# Plan de Publicación: Migración a Supabase PostgreSQL + Vercel

Esta guía define el roadmap exacto para llevar la aplicación **Cosa Nostra App** a producción esta semana utilizando **Supabase PostgreSQL** como base de datos centralizada y **Vercel** para el hosting.

---

## PASO 1: Crear Proyecto en Supabase (2 minutos)

1. Entra a **[https://supabase.com](https://supabase.com)** e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"New Project"**.
3. Selecciona tu organización, dale un nombre al proyecto (ejemplo: `cosa-nostra-prod`) y establece una contraseña segura para la base de datos.
4. Una vez creado el proyecto, ve a **Project Settings $\rightarrow$ Database** y copia tus cadenas de conexión:
   - **Transaction Connection String (Port 6543 / Pooler):**
     `postgresql://postgres.ref:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
   - **Direct Connection String (Port 5432):**
     `postgresql://postgres.ref:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`

---

## PASO 2: Crear el Esquema de Tablas en Supabase

Tienes dos formas súper sencillas para crear las tablas:

### Opción A (Recomendada - Vía SQL Editor en la Web de Supabase):
1. Ve al menú **SQL Editor** en Supabase.
2. Abre el archivo [`scripts/supabase_schema.sql`](file:///E:/DeAng/Descargas/cosa-nostra-app-completa%20%283%29/scripts/supabase_schema.sql) que hemos generado en el proyecto.
3. Copia todo su contenido, pégalo en el SQL Editor y haz clic en **Run**.
4. ¡Todas las 18 tablas e índices quedarán creados al instante!

### Opción B (Vía Prisma CLI):
1. Cambia temporalmente en `prisma/schema.prisma` el provider a `"postgresql"`.
2. Asigna las variables de Supabase en tu `.env` local.
3. Ejecuta:
   ```cmd
   npx prisma db push
   ```

---

## PASO 3: Cargar los Datos Iniciales (78 Jugadores y 4 Torneos Reales)

En tu máquina local, ejecuta el script de siembra para poblar Supabase con toda la historia real de la familia:

```cmd
npm run db:seed:real
```

---

## PASO 4: Configurar Variables de Entorno en Vercel

En tu panel de Vercel (**Project Settings $\rightarrow$ Environment Variables**), agrega las siguientes variables de producción:

| Nombre de Variable | Valor |
| :--- | :--- |
| `DATABASE_URL` | Tu conexión de Supabase Pooler (Port 6543 con `?pgbouncer=true`) |
| `DIRECT_URL` | Tu conexión directa de Supabase (Port 5432) |
| `VAPID_PUBLIC_KEY` | `BL23e9mg_1ziP6sARb2cGE8zMW58M7XKvdocK9cMKAKKw3Hdrb8FECSKz0HNRPycC6e5mcceUJeHVUEPfL6L-jE` |
| `VAPID_PRIVATE_KEY` | `eBYqwbnFm0a0Cba_fXT-JZY6mHPHeHdDkqrgzLLIDPY` |
| `VAPID_SUBJECT` | `mailto:natalebong@hotmail.com` |

---

## PASO 5: Prueba de Validación de la App Publicada

Antes del lanzamiento oficial, realizaremos la prueba completa de producción:

1. **Crear Jugador:** Desde el panel Admin en la app publicada.
2. **Crear Torneo e Importar Excel BetaDomino:** Verificar que el matching reconozca jugadores y aplique deltas de ranking.
3. **Autenticación y Sesión:** Probar registro de nuevo miembro, inicio de sesión, edición de perfil y cierre de sesión.
4. **Verificación Multi-Dispositivo:** Validar respuesta en Chrome/Edge (PC), iPhone (Safari PWA) y Android.
