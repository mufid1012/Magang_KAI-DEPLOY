# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

KAI RailTrack PPJ — railway track inspection monitoring system for PT KAI DAOP 6 Yogyakarta. Two modules: a Next.js 14 frontend (`ppj-kai-frontend/`) and an Express 5 + Prisma + MySQL backend (`ppj-kai-backend/`).

`AGENTS.md` at the repo root is the exhaustive project reference (full schema, every endpoint, feature-by-feature notes). Read it before non-trivial changes. This file covers commands and the load-bearing architecture; AGENTS.md has the rest.

## Commands

Backend (`cd ppj-kai-backend`):
```bash
npm install
npx prisma db push && npx prisma generate   # sync schema + regenerate client
npx tsx seed-user.ts                         # REQUIRED: seeds Wilayah, admin/QC/KUPT/PPJ accounts, sample tugas
npx tsx seed-kategori.ts                     # REQUIRED: seeds default kategori_temuan
npm test                                     # unit tests (termasuk pencocokan import Excel)
npm run dev                                  # tsx watch src/index.ts, port from .env (default 5001)
```
`.env` needs `DATABASE_URL`, `PORT`, `JWT_SECRET`. Map search optionally uses a Nominatim-compatible `GEOCODING_API_URL` (defaults to the public OSM endpoint) and `APP_URL` for provider identification. Search is submit-only, cached, and globally throttled.

Frontend (`cd ppj-kai-frontend`):
```bash
npm install
npm run dev      # Next dev server, port 3000
npm run build    # production build — use this to verify a change compiles
npm run lint     # next lint (eslint)
```

## Architecture

Frontend talks to backend over REST + JWT. `lib/api.ts` is the single Axios instance and auto-attaches the JWT — check it before debugging any API call.

Roles are `admin | qc | kupt | ppj | guest`, gated in `middleware/auth.middleware.ts` via `requireAuth` + `requireRole`. Routes split by role: `/api/tugas`, `/api/tracking`, `/api/laporan` (any authed user), `/api/admin/*` (admin), `/api/guest/*` (guest/qc/kupt).

Data flow entity chain: `users → tugas_ppj → tracking → laporan`. A tugas is assigned to a PPJ, who starts a tracking session, which accumulates GPS path + laporan (findings). `prisma/schema.prisma` is the source of truth for all structure.

### Load-bearing invariants (violating these silently breaks things)

- **managerId scoping** — All admin queries filter by `managerId` (the admin's own id). Seeders must create the admin first, then create PPJ users with `managerId: admin.id`, or the admin dashboard shows nothing.
- **JWT payload is `{ id, role }` only** — no `nipp`. Never read `req.user.nipp` from the decoded token.
- **PPJ has exactly one page: `/inspeksi`** — dashboard/riwayat/profile were deleted. All PPJ redirects go to `/inspeksi`, never `/dashboard`. Flow: login → `/inspeksi` (task selector) → `/inspeksi/[id]` (tracking) → `/inspeksi/[id]/selesai`.
- **Kategori temuan is dynamic** — fetched from `kategori_temuan` via `/api/kategori-temuan`, CRUD'd by admin. Do not hardcode finding categories; fetch with a fallback to defaults.
- **Station selection is a dropdown, not map-click** — coordinates live in the `STATIONS` constant in `admin/page.tsx`. `AdminMap` is read-only (no `pickMode`/`onMapClick`); don't add click handlers to it.

### Maps & railway routing

- `lib/railway.ts` owns all railway logic: `fetchRailwayGeometry()` queries Overpass API for `way[railway]` in a bbox, builds an adjacency graph, and runs Dijkstra for the actual rail path (not a straight line); `snapToRailwayPoint()` snaps to nearest rail. Always go through `fetchOverpass()` — it fails over across 3 Overpass mirrors. Never hardcode one endpoint.
- Three map components: `DynamicMap` (PPJ tracking), `AdminMap` (admin/QC task routes + emergency markers), `GuestMap` (guest live view). `AdminMap` caches geometry in a `useRef` Map keyed by start-end coords; it only caches non-empty results so failed fetches can retry.
- Per-officer color is a deterministic hash of NIPP → HSL hue (same NIPP = same color). `petugasColor()` is currently duplicated in `AdminMap.tsx` and `admin/page.tsx`.
- Leaflet renders at z-index 400; modals use `z-[9999]` and map containers use `isolation: isolate` to keep layering correct.

### Other notable behavior

- **Geofencing** — PPJ can't start tracking outside `GEOFENCE_RADIUS` (500m) of the tugas start point. Localhost shows a "Mode Testing" toggle that bypasses this; it never renders in production.
- **Session persistence** — tracking state (`trackPath`, `trackingId`) is kept in localStorage; backend `startTime` is the source of truth for elapsed time on restore.
- **Emergency alarm** — a laporan with an emergency/berat status makes the QC/Admin UI loop an alarm sound until the user clicks to dismiss.
- **Excel import** — admins import monthly schedules; parsing is in `import.controller.ts` (`/api/admin/import/preview` + `/import/process`).
- Body size limit is 10MB (base64 photo uploads).

## Working in the large files

`inspeksi/[id]/page.tsx` (~850 lines) and `admin/page.tsx` (~580 lines) are the biggest files — read them by section, not all at once. `globals.css` holds all Material Design 3 design tokens (colors, spacing, typography).
