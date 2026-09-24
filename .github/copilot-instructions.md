# Copilot instructions

This repository is a Next.js + Prisma + SQLite app for the Cosa Nostra club management system.

## Core rules
- Follow the app-router patterns already in `src/app` and `src/lib`.
- Prefer focused changes that match the existing implementation style.
- Keep API routes under `src/app/api` and preserve the project’s auth/admin patterns.
- Avoid unnecessary schema churn in Prisma.
- Validate with the most relevant command before finishing work.

## Commands
```bash
npm install
npm run dev
npm run lint
npm run build
npm run db:setup:real
```

## Notes
- The app includes PWA and web-push behavior; do not break service worker or notification-related code unintentionally.
- Admin routes must remain access-controlled.
- Use the seeded real data setup when running locally if database state is missing.
