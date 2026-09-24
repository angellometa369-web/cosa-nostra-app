# Guía de Despliegue en Vercel + Turso (SQLite Serverless Gratuito)

Esta guía explica cómo desplegar la aplicación **Cosa Nostra App** en Vercel con una base de datos **Turso** (SQLite distribuido) 100% gratuita y persistente.

---

## ¿Por qué Turso?
En Vercel las funciones son *serverless* (los archivos locales como `dev.db` se reinician y se borran en cada petición). Turso es una base de datos SQLite en la nube gratuita diseñada específicamente para funcionar con Vercel y Prisma sin cambiar el schema de tu proyecto.

---

## PASO 1: Crear la base de datos en Turso (3 minutos)

1. **Instala la CLI de Turso o regístrate en la web:**
   - Sitio web: [https://turso.tech](https://turso.tech)
   - O vía terminal:
     ```cmd
     npx turso-cli auth signup
     ```

2. **Crea una nueva base de datos:**
   ```cmd
   npx turso-cli db create cosa-nostra-db
   ```

3. **Obtén la URL y el Token de autenticación:**
   - **URL de la base de datos:**
     ```cmd
     npx turso-cli db show cosa-nostra-db --url
     ```
     *(Ejemplo: `libsql://cosa-nostra-db-tuusuario.turso.io`)*

   - **Token de autenticación:**
     ```cmd
     npx turso-cli db tokens create cosa-nostra-db
     ```

---

## PASO 2: Cargar el Esquema y Datos Reales en Turso

En tu proyecto local, configura temporalmente las variables en `.env` para subir las tablas y datos iniciales:

```env
TURSO_DATABASE_URL="libsql://cosa-nostra-db-tuusuario.turso.io"
TURSO_AUTH_TOKEN="tu_token_aqui"
```

Y ejecuta el comando de inicialización:
```cmd
npx prisma db push
npm run db:seed:real
```
*¡Listo! Turso ahora tiene los 78 jugadores y 4 torneos reales cargados en la nube.*

---

## PASO 3: Desplegar en Vercel

1. Ve a [https://vercel.com](https://vercel.com) e inicia sesión.
2. Haz clic en **"Add New Project"** y selecciona tu repositorio de GitHub / GitLab.
3. En la sección **Environment Variables** (Variables de Entorno) agrega:

   | Nombre de Variable | Valor |
   | :--- | :--- |
   | `TURSO_DATABASE_URL` | `libsql://cosa-nostra-db-tuusuario.turso.io` |
   | `TURSO_AUTH_TOKEN` | `eyJhbGciOi...` *(Tu token de Turso)* |
   | `VAPID_PUBLIC_KEY` | *(Tu clave VAPID pública)* |
   | `VAPID_PRIVATE_KEY` | *(Tu clave VAPID privada)* |
   | `VAPID_SUBJECT` | `mailto:natalebong@hotmail.com` |

4. Haz clic en **Deploy**.

Vercel compilará la aplicación Next.js y la conectará a Turso de manera transparente mediante el adaptador `@prisma/adapter-libsql`.

---

## RESULTADO
Tu aplicación estará disponible 24/7 en una URL como:
`https://cosa-nostra-app.vercel.app`

Todas las importaciones de torneos, logins, registros de usuarios y cambios en el ranking persistirán en Turso sin ningún costo de hosting.
