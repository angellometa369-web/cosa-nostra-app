# AGENTS.md

## Project overview
This repository is a full-stack Next.js application for the Cosa Nostra / The Godfather Club app. It uses:
- Next.js App Router
- React 19
- Prisma with SQLite
- PWA support with service worker and web push
- Session-based auth with bcrypt

## Working conventions
- Prefer the existing app-router patterns in `src/app` and `src/lib`.
- Keep API routes under `src/app/api/**` and follow the established route structure.
- Preserve the current Prisma schema and migration flow; avoid making schema changes unless explicitly required.
- When adding or changing features, prefer minimal, localized edits over broad refactors.
- Keep behavior consistent with the product setup described in `README.md`.

## Validation
Before claiming work is complete, validate with the smallest relevant command:
- `npm run lint` for linting
- `npm run build` for production build verification when a behavioral change affects app integration
- `npm run db:setup:real` only when database initialization is required for local validation

## Local development
Common commands:
```bash
npm install
npm run db:setup:real
npm run dev
```

Production check:
```bash
npm run build
npm start
```

## Important repo-specific notes
- The app uses a local SQLite database and seeded real data via `prisma/seed-real.ts`.
- Admin-protected routes should remain protected by the existing auth/admin layer.
- Push notification support depends on VAPID config in `.env` and a valid service worker setup.
- Keep login, registration, and admin flows aligned with the current session/auth conventions.

## Preferred behavior for agents
- Read the relevant route/component before patching.
- Match the existing naming, TypeScript, and styling conventions.
- Use the smallest possible fix; avoid unrelated cleanup.
- Explain the root cause and validation when reporting a fix.
- Do not add test-only code to production files.
